<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<tagfile>
  <compound kind="file">
    <name>microhttpd_lib.h</name>
    <path></path>
    <filename>microhttpd.h</filename>
    <member kind="define">
      <type>#define</type>
      <name>MHD_YES</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_NO</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_OK</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_BAD_REQUEST</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_URI_TOO_LONG</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_PAYLOAD_TOO_LARGE</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_REQUEST_TIMEOUT</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_ACCEPTED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_NOT_FOUND</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_NO_CONTENT</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_GONE</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_PRECONDITION_FAILED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_CONFLICT</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_FORBIDDEN</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_SERVICE_UNAVAILABLE</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_FAILED_DEPENDENCY</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_INTERNAL_SERVER_ERROR</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_OPTION_NOTIFY_COMPLETED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_BAD_GATEWAY</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_GATEWAY_TIMEOUT</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_METHOD_NOT_ALLOWED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_UNAUTHORIZED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_PAYMENT_REQUIRED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_NOT_IMPLEMENTED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_NOT_ACCEPTABLE</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_ALREADY_REPORTED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_EXPECTATION_FAILED</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="define">
      <type>#define</type>
      <name>MHD_HTTP_TOO_MANY_REQUESTS</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist></arglist>
    </member>
    <member kind="typedef">
      <type>int</type>
      <name>MHD_AccessHandlerCallback</name>
      <anchorfile>microhttpd.h</anchorfile>
      <arglist>)(void *cls, struct MHD_Connection *connection, const char *url, const char *method, const char *version, const char *upload_data, size_t *upload_data_size, void **con_cls)</arglist>
    </member>
  </compound>
</tagfile>
