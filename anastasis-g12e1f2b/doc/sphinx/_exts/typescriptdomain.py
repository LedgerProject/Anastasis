"""
TypeScript domain.

:copyright: Copyright 2019 by Taler Systems SA
:license: LGPLv3+
:author: Florian Dold
"""

import re

from pathlib import Path

from docutils import nodes
from typing import List, Optional, Iterable, Dict, Tuple
from typing import cast

from pygments.lexers import get_lexer_by_name
from pygments.filter import Filter
from pygments.token import Literal, Text, Operator, Keyword, Name, Number
from pygments.token import Comment, Token, _TokenType
from pygments.token import *
from pygments.lexer import RegexLexer, bygroups, include
from pygments.formatters import HtmlFormatter

from docutils import nodes
from docutils.nodes import Element, Node

from sphinx.roles import XRefRole
from sphinx.domains import Domain, ObjType, Index
from sphinx.directives import directives
from sphinx.util.docutils import SphinxDirective
from sphinx.util.nodes import make_refnode
from sphinx.util import logging
from sphinx.highlighting import PygmentsBridge
from sphinx.builders.html import StandaloneHTMLBuilder
from sphinx.pygments_styles import SphinxStyle

logger = logging.getLogger(__name__)


class TypeScriptDefinition(SphinxDirective):
    """
    Directive for a code block with special highlighting or line numbering
    settings.
    """

    has_content = True
    required_arguments = 1
    optional_arguments = 0
    final_argument_whitespace = False
    option_spec = {
        "force": directives.flag,
        "linenos": directives.flag,
        "dedent": int,
        "lineno-start": int,
        "emphasize-lines": directives.unchanged_required,
        "caption": directives.unchanged_required,
        "class": directives.class_option,
    }

    def run(self) -> List[Node]:
        document = self.state.document
        code = "\n".join(self.content)
        location = self.state_machine.get_source_and_line(self.lineno)

        linespec = self.options.get("emphasize-lines")
        if linespec:
            try:
                nlines = len(self.content)
                hl_lines = parselinenos(linespec, nlines)
                if any(i >= nlines for i in hl_lines):
                    logger.warning(
                        __("line number spec is out of range(1-%d): %r")
                        % (nlines, self.options["emphasize-lines"]),
                        location=location,
                    )

                hl_lines = [x + 1 for x in hl_lines if x < nlines]
            except ValueError as err:
                return [document.reporter.warning(err, line=self.lineno)]
        else:
            hl_lines = None

        if "dedent" in self.options:
            location = self.state_machine.get_source_and_line(self.lineno)
            lines = code.split("\n")
            lines = dedent_lines(lines, self.options["dedent"], location=location)
            code = "\n".join(lines)

        literal = nodes.literal_block(code, code)  # type: Element
        if "linenos" in self.options or "lineno-start" in self.options:
            literal["linenos"] = True
        literal["classes"] += self.options.get("class", [])
        literal["force"] = "force" in self.options
        literal["language"] = "tsref"
        extra_args = literal["highlight_args"] = {}
        if hl_lines is not None:
            extra_args["hl_lines"] = hl_lines
        if "lineno-start" in self.options:
            extra_args["linenostart"] = self.options["lineno-start"]
        self.set_source_info(literal)

        caption = self.options.get("caption")
        if caption:
            try:
                literal = container_wrapper(self, literal, caption)
            except ValueError as exc:
                return [document.reporter.warning(exc, line=self.lineno)]

        tsid = "tsref-type-" + self.arguments[0]
        literal["ids"].append(tsid)

        tsname = self.arguments[0]
        ts = self.env.get_domain("ts")
        ts.add_object("type", tsname, self.env.docname, tsid)

        return [literal]


class TypeScriptDomain(Domain):
    """TypeScript domain."""

    name = "ts"
    label = "TypeScript"

    directives = {
        "def": TypeScriptDefinition,
    }

    roles = {
        "type": XRefRole(
            lowercase=False, warn_dangling=True, innernodeclass=nodes.inline
        ),
    }

    dangling_warnings = {
        "type": "undefined TypeScript type: %(target)s",
    }

    def resolve_xref(self, env, fromdocname, builder, typ, target, node, contnode):
        try:
            info = self.objects[(str(typ), str(target))]
        except KeyError:
            logger.warn("type {}/{} not found".format(typ, target))
            return None
        else:
            anchor = "tsref-type-{}".format(str(target))
            title = typ.upper() + " " + target
            return make_refnode(builder, fromdocname, info[0], anchor, contnode, title)

    def resolve_any_xref(self, env, fromdocname, builder, target, node, contnode):
        """Resolve the pending_xref *node* with the given *target*.

        The reference comes from an "any" or similar role, which means that Sphinx
        don't know the type.

        For now sphinxcontrib-httpdomain doesn't resolve any xref nodes.

        :return:
           list of tuples ``('domain:role', newnode)``, where ``'domain:role'``
           is the name of a role that could have created the same reference,
        """
        ret = []
        try:
            info = self.objects[("type", str(target))]
        except KeyError:
            pass
        else:
            anchor = "tsref-type-{}".format(str(target))
            title = "TYPE" + " " + target
            node = make_refnode(builder, fromdocname, info[0], anchor, contnode, title)
            ret.append(("ts:type", node))
        return ret

    @property
    def objects(self) -> Dict[Tuple[str, str], Tuple[str, str]]:
        return self.data.setdefault(
            "objects", {}
        )  # (objtype, name) -> docname, labelid

    def add_object(self, objtype: str, name: str, docname: str, labelid: str) -> None:
        self.objects[objtype, name] = (docname, labelid)


class BetterTypeScriptLexer(RegexLexer):
    """
    For `TypeScript <https://www.typescriptlang.org/>`_ source code.
    """

    name = "TypeScript"
    aliases = ["ts"]
    filenames = ["*.ts"]
    mimetypes = ["text/x-typescript"]

    flags = re.DOTALL
    tokens = {
        "commentsandwhitespace": [
            (r"\s+", Text),
            (r"<!--", Comment),
            (r"//.*?\n", Comment.Single),
            (r"/\*.*?\*/", Comment.Multiline),
        ],
        "slashstartsregex": [
            include("commentsandwhitespace"),
            (
                r"/(\\.|[^[/\\\n]|\[(\\.|[^\]\\\n])*])+/" r"([gim]+\b|\B)",
                String.Regex,
                "#pop",
            ),
            (r"(?=/)", Text, ("#pop", "badregex")),
            (r"", Text, "#pop"),
        ],
        "badregex": [(r"\n", Text, "#pop")],
        "typeexp": [
            (r"[a-zA-Z0-9_?.$]+", Keyword.Type),
            (r"\s+", Text),
            (r"[|]", Text),
            (r"\n", Text, "#pop"),
            (r";", Text, "#pop"),
            (r"", Text, "#pop"),
        ],
        "root": [
            (r"^(?=\s|/|<!--)", Text, "slashstartsregex"),
            include("commentsandwhitespace"),
            (
                r"\+\+|--|~|&&|\?|:|\|\||\\(?=\n)|"
                r"(<<|>>>?|==?|!=?|[-<>+*%&\|\^/])=?",
                Operator,
                "slashstartsregex",
            ),
            (r"[{(\[;,]", Punctuation, "slashstartsregex"),
            (r"[})\].]", Punctuation),
            (
                r"(for|in|while|do|break|return|continue|switch|case|default|if|else|"
                r"throw|try|catch|finally|new|delete|typeof|instanceof|void|"
                r"this)\b",
                Keyword,
                "slashstartsregex",
            ),
            (
                r"(var|let|const|with|function)\b",
                Keyword.Declaration,
                "slashstartsregex",
            ),
            (
                r"(abstract|boolean|byte|char|class|const|debugger|double|enum|export|"
                r"extends|final|float|goto|implements|import|int|interface|long|native|"
                r"package|private|protected|public|short|static|super|synchronized|throws|"
                r"transient|volatile)\b",
                Keyword.Reserved,
            ),
            (r"(true|false|null|NaN|Infinity|undefined)\b", Keyword.Constant),
            (
                r"(Array|Boolean|Date|Error|Function|Math|netscape|"
                r"Number|Object|Packages|RegExp|String|sun|decodeURI|"
                r"decodeURIComponent|encodeURI|encodeURIComponent|"
                r"Error|eval|isFinite|isNaN|parseFloat|parseInt|document|this|"
                r"window)\b",
                Name.Builtin,
            ),
            # Match stuff like: module name {...}
            (
                r"\b(module)(\s*)(\s*[a-zA-Z0-9_?.$][\w?.$]*)(\s*)",
                bygroups(Keyword.Reserved, Text, Name.Other, Text),
                "slashstartsregex",
            ),
            # Match variable type keywords
            (r"\b(string|bool|number)\b", Keyword.Type),
            # Match stuff like: constructor
            (r"\b(constructor|declare|interface|as|AS)\b", Keyword.Reserved),
            # Match stuff like: super(argument, list)
            (
                r"(super)(\s*)\(([a-zA-Z0-9,_?.$\s]+\s*)\)",
                bygroups(Keyword.Reserved, Text),
                "slashstartsregex",
            ),
            # Match stuff like: function() {...}
            (r"([a-zA-Z_?.$][\w?.$]*)\(\) \{", Name.Other, "slashstartsregex"),
            # Match stuff like: (function: return type)
            (
                r"([a-zA-Z0-9_?.$][\w?.$]*)(\s*:\s*)",
                bygroups(Name.Other, Text),
                "typeexp",
            ),
            # Match stuff like: type Foo = Bar | Baz
            (
                r"\b(type)(\s*)([a-zA-Z0-9_?.$]+)(\s*)(=)(\s*)",
                bygroups(Keyword.Reserved, Text, Name.Other, Text, Operator, Text),
                "typeexp",
            ),
            (r"[$a-zA-Z_][a-zA-Z0-9_]*", Name.Other),
            (r"[0-9][0-9]*\.[0-9]+([eE][0-9]+)?[fd]?", Number.Float),
            (r"0x[0-9a-fA-F]+", Number.Hex),
            (r"[0-9]+", Number.Integer),
            (r'"(\\\\|\\"|[^"])*"', String.Double),
            (r"'(\\\\|\\'|[^'])*'", String.Single),
        ],
    }


# Map from token id to props.
# Properties can't be added to tokens
# since they derive from Python's tuple.
token_props = {}


class LinkFilter(Filter):
    def __init__(self, app, **options):
        self.app = app
        Filter.__init__(self, **options)

    def _filter_one_literal(self, ttype, value):
        last = 0
        for m in re.finditer(literal_reg, value):
            pre = value[last : m.start()]
            if pre:
                yield ttype, pre
            t = copy_token(ttype)
            tok_setprop(t, "is_literal", True)
            yield t, m.group(1)
            last = m.end()
        post = value[last:]
        if post:
            yield ttype, post

    def filter(self, lexer, stream):
        for ttype, value in stream:
            if ttype in Token.Keyword.Type:
                t = copy_token(ttype)
                tok_setprop(t, "xref", value.strip())
                tok_setprop(t, "is_identifier", True)
                yield t, value
            elif ttype in Token.Comment:
                last = 0
                for m in re.finditer(link_reg, value):
                    pre = value[last : m.start()]
                    if pre:
                        yield from self._filter_one_literal(ttype, pre)
                    t = copy_token(ttype)
                    x1, x2 = m.groups()
                    x0 = m.group(0)
                    if x2 is None:
                        caption = x1.strip()
                        xref = x1.strip()
                    else:
                        caption = x1.strip()
                        xref = x2.strip()
                    tok_setprop(t, "xref", xref)
                    tok_setprop(t, "caption", caption)
                    if x0.endswith("_"):
                        tok_setprop(t, "trailing_underscore", True)
                    yield t, m.group(1)
                    last = m.end()
                post = value[last:]
                if post:
                    yield from self._filter_one_literal(ttype, post)
            else:
                yield ttype, value


_escape_html_table = {
    ord("&"): u"&amp;",
    ord("<"): u"&lt;",
    ord(">"): u"&gt;",
    ord('"'): u"&quot;",
    ord("'"): u"&#39;",
}


class LinkingHtmlFormatter(HtmlFormatter):
    def __init__(self, **kwargs):
        super(LinkingHtmlFormatter, self).__init__(**kwargs)
        self._builder = kwargs["_builder"]
        self._bridge = kwargs["_bridge"]

    def _get_value(self, value, tok):
        xref = tok_getprop(tok, "xref")
        caption = tok_getprop(tok, "caption")

        if tok_getprop(tok, "is_literal"):
            return '<span style="font-weight: bolder">%s</span>' % (value,)

        if tok_getprop(tok, "trailing_underscore"):
            logger.warn(
                "{}:{}: code block contains xref to '{}' with unsupported trailing underscore".format(
                    self._bridge.path, self._bridge.line, xref
                )
            )

        if tok_getprop(tok, "is_identifier"):
            if xref.startswith('"'):
                return value
            if re.match("^[0-9]+$", xref) is not None:
                return value
            if xref in (
                "number",
                "object",
                "string",
                "boolean",
                "any",
                "true",
                "false",
                "null",
                "undefined",
                "Array",
                "unknown",
            ):
                return value

        if self._bridge.docname is None:
            return value
        if xref is None:
            return value
        content = caption if caption is not None else value
        ts = self._builder.env.get_domain("ts")
        r1 = ts.objects.get(("type", xref), None)
        if r1 is not None:
            rel_uri = (
                self._builder.get_relative_uri(self._bridge.docname, r1[0])
                + "#"
                + r1[1]
            )
            return (
                '<a style="color:inherit;text-decoration:underline" href="%s">%s</a>'
                % (rel_uri, content)
            )

        std = self._builder.env.get_domain("std")
        r2 = std.labels.get(xref.lower(), None)
        if r2 is not None:
            rel_uri = (
                self._builder.get_relative_uri(self._bridge.docname, r2[0])
                + "#"
                + r2[1]
            )
            return (
                '<a style="color:inherit;text-decoration:underline" href="%s">%s</a>'
                % (rel_uri, content)
            )
        r3 = std.anonlabels.get(xref.lower(), None)
        if r3 is not None:
            rel_uri = (
                self._builder.get_relative_uri(self._bridge.docname, r3[0])
                + "#"
                + r3[1]
            )
            return (
                '<a style="color:inherit;text-decoration:underline" href="%s">%s</a>'
                % (rel_uri, content)
            )

        logger.warn(
            "{}:{}: code block contains unresolved xref '{}'".format(
                self._bridge.path, self._bridge.line, xref
            )
        )

        return value

    def _fmt(self, value, tok):
        cls = self._get_css_class(tok)
        value = self._get_value(value, tok)
        if cls is None or cls == "":
            return value
        return '<span class="%s">%s</span>' % (cls, value)

    def _format_lines(self, tokensource):
        """
        Just format the tokens, without any wrapping tags.
        Yield individual lines.
        """
        lsep = self.lineseparator
        escape_table = _escape_html_table

        line = ""
        for ttype, value in tokensource:
            link = get_annotation(ttype, "link")

            parts = value.translate(escape_table).split("\n")

            if len(parts) == 0:
                # empty token, usually should not happen
                pass
            elif len(parts) == 1:
                # no newline before or after token
                line += self._fmt(parts[0], ttype)
            else:
                line += self._fmt(parts[0], ttype)
                yield 1, line + lsep
                for part in parts[1:-1]:
                    yield 1, self._fmt(part, ttype) + lsep
                line = self._fmt(parts[-1], ttype)

        if line:
            yield 1, line + lsep


class MyPygmentsBridge(PygmentsBridge):
    def __init__(self, builder, trim_doctest_flags):
        self.dest = "html"
        self.trim_doctest_flags = trim_doctest_flags
        self.formatter_args = {
            "style": SphinxStyle,
            "_builder": builder,
            "_bridge": self,
        }
        self.formatter = LinkingHtmlFormatter
        self.builder = builder
        self.path = None
        self.line = None
        self.docname = None

    def highlight_block(
        self, source, lang, opts=None, force=False, location=None, **kwargs
    ):
        if isinstance(location, tuple):
            docname, line = location
            self.line = line
            self.path = self.builder.env.doc2path(docname)
            self.docname = docname
        elif isinstance(location, Element):
            self.line = location.line
            self.path = location.source
            self.docname = self.builder.env.path2doc(self.path)
        return super().highlight_block(source, lang, opts, force, location, **kwargs)


class MyHtmlBuilder(StandaloneHTMLBuilder):
    name = "html-linked"

    def init_highlighter(self):
        if self.config.pygments_style is not None:
            style = self.config.pygments_style
        elif self.theme:
            style = self.theme.get_confstr("theme", "pygments_style", "none")
        else:
            style = "sphinx"
        self.highlighter = MyPygmentsBridge(self, self.config.trim_doctest_flags)
        self.dark_highlighter = None


def get_annotation(tok, key):
    if not hasattr(tok, "kv"):
        return None
    return tok.kv.get(key)


def copy_token(tok):
    new_tok = _TokenType(tok)
    # This part is very fragile against API changes ...
    new_tok.subtypes = set(tok.subtypes)
    new_tok.parent = tok.parent
    return new_tok


def tok_setprop(tok, key, value):
    tokid = id(tok)
    e = token_props.get(tokid)
    if e is None:
        e = token_props[tokid] = (tok, {})
    _, kv = e
    kv[key] = value


def tok_getprop(tok, key):
    tokid = id(tok)
    e = token_props.get(tokid)
    if e is None:
        return None
    _, kv = e
    return kv.get(key)


link_reg = re.compile(r"(?<!`)`([^`<]+)\s*(?:<([^>]+)>)?\s*`_?")
literal_reg = re.compile(r"``([^`]+)``")


def setup(app):

    class TsrefLexer(BetterTypeScriptLexer):
        def __init__(self, **options):
            super().__init__(**options)
            self.add_filter(LinkFilter(app))

    app.add_lexer("tsref", TsrefLexer)
    app.add_domain(TypeScriptDomain)
    app.add_builder(MyHtmlBuilder)
