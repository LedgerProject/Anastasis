/**
 * Extract a numeric @a code from a @a wire_subject.
 * Also checks that the @a wire_subject contains the
 * string "anastasis".
 *
 * @param wire_subject wire subject to extract @a code from
 * @param[out] code where to write the extracted code
 * @return #GNUNET_OK if a @a code was extracted
 */
static enum GNUNET_GenericReturnValue
extract_code (const char *wire_subject,
              uint64_t *code)
{
  unsigned long long c;
  const char *pos;

  if (NULL ==
      strcasestr (wire_subject,
                  "anastasis"))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Keyword 'anastasis' missing in subject `%s', ignoring transfer\n",
                wire_subject);
    return GNUNET_SYSERR;
  }
  pos = wire_subject;
  while ( ('\0' != *pos) &&
          (! isdigit ((int) *pos)) )
    pos++;
  if (1 !=
      sscanf (pos,
              "%llu",
              &c))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_WARNING,
                "Did not find any code number in subject `%s', ignoring transfer\n",
                wire_subject);
    return GNUNET_SYSERR;
  }

  *code = (uint64_t) c;
  return GNUNET_OK;
}
