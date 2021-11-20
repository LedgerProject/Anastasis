declare var i18n: any;

console.log(i18n`Hello1, World`);
console.log(i18n.foo()`Hello2, World`);
console.log(i18n.foo()`Hello3, World`);


/* This is a comment and should be included */
console.log(i18n().foo()`Hello4, World`);


console.log(i18n.foo`Hello5, World`);
console.log(i18n.foo`Hello6,${123} World`);

/*
This one has a multi line comment.
It has multiple lines, and a trailing empty line.

*/
console.log(/*lol*/i18n.foo`Hello7,${123} World${42}`);

// @ts-expect-error
i18n.plural(i18n`one ${"foo"}`, i18`many ${"bar"}`);

// @ts-expect-error
i18n.plural(i18n.foo`one bla ${"foo"}`, i18.foo`many bla ${"bar"}`);

let x = 42;

i18n.plural(i18n`I have ${x} apple`, i18n`I have ${x} apples`);

console.log(i18n`${"foo"}Hello8,${123} World${42}`);

/*

This one has a multi line comment.
It has multiple lines, and a leading empty line.
*/
console.log(i18n`Hello9," '" World`);

// Comments with space in between do not count

console.log(i18n`Hello10
            ," '" Wo
            rld`);


console.log(i18n`Hello11 this is a long long string
it will go over multiple lines and in the pofile
it should be wrapped and stuff`);

// This is a single line comment
console.log(i18n`Hello12 this is a long long string it will go over multiple lines and in the pofile it should be wrapped and stuff. asdf asdf asdf asdf asdf asdf asdf asdf adsf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf asdf`);

function foo(...args: any[]) {
}

console.log(foo`Another string, must be excluded`);


// First occurrence
console.log(i18n`This message appears twice`);
// Second occurrence
console.log(i18n`This message appears twice`);
