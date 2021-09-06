/*
  This file is part of Anastasis
  Copyright (C) 2019, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file anastasis-httpd_policy.c
 * @brief functions to handle incoming requests on /policy/
 * @author Dennis Neufeld
 * @author Dominik Meister
 * @author Christian Grothoff
 */
#include "platform.h"
#include "anastasis-httpd.h"
#include "anastasis-httpd_policy.h"
#include "anastasis_service.h"
#include <gnunet/gnunet_util_lib.h>
#include <gnunet/gnunet_rest_lib.h>
#include <taler/taler_json_lib.h>
#include <taler/taler_merchant_service.h>
#include <taler/taler_signatures.h>

/**
 * How long do we hold an HTTP client connection if
 * we are awaiting payment before giving up?
 */
#define CHECK_PAYMENT_GENERIC_TIMEOUT GNUNET_TIME_relative_multiply ( \
    GNUNET_TIME_UNIT_MINUTES, 30)


/**
 * Return the current recoverydocument of @a account on @a connection
 * using @a default_http_status on success.
 *
 * @param connection MHD connection to use
 * @param account_pub account to query
 * @return MHD result code
 */
static MHD_RESULT
return_policy (struct MHD_Connection *connection,
               const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub)
{
  enum GNUNET_DB_QueryStatus qs;
  struct MHD_Response *resp;
  struct ANASTASIS_AccountSignatureP account_sig;
  struct GNUNET_HashCode recovery_data_hash;
  const char *version_s;
  char version_b[14];
  uint32_t version;
  void *res_recovery_data;
  size_t res_recovery_data_size;

  version_s = MHD_lookup_connection_value (connection,
                                           MHD_GET_ARGUMENT_KIND,
                                           "version");
  if (NULL != version_s)
  {
    char dummy;

    if (1 != sscanf (version_s,
                     "%u%c",
                     &version,
                     &dummy))
    {
      return TALER_MHD_reply_with_error (connection,
                                         MHD_HTTP_BAD_REQUEST,
                                         TALER_EC_GENERIC_PARAMETER_MALFORMED,
                                         "version");
    }
    qs = db->get_recovery_document (db->cls,
                                    account_pub,
                                    version,
                                    &account_sig,
                                    &recovery_data_hash,
                                    &res_recovery_data_size,
                                    &res_recovery_data);
  }
  else
  {
    qs = db->get_latest_recovery_document (db->cls,
                                           account_pub,
                                           &account_sig,
                                           &recovery_data_hash,
                                           &res_recovery_data_size,
                                           &res_recovery_data,
                                           &version);
    GNUNET_snprintf (version_b,
                     sizeof (version_b),
                     "%u",
                     (unsigned int) version);
    version_s = version_b;
  }
  switch (qs)
  {
  case GNUNET_DB_STATUS_HARD_ERROR:
    GNUNET_break (0);
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_GENERIC_DB_FETCH_FAILED,
                                       "get_recovery_document");
  case GNUNET_DB_STATUS_SOFT_ERROR:
    GNUNET_break (0);
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_GENERIC_DB_SOFT_FAILURE,
                                       "get_recovery_document");
  case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_NOT_FOUND,
                                       TALER_EC_ANASTASIS_POLICY_NOT_FOUND,
                                       NULL);
  case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
    /* interesting case below */
    break;
  }
  resp = MHD_create_response_from_buffer (res_recovery_data_size,
                                          res_recovery_data,
                                          MHD_RESPMEM_MUST_FREE);
  TALER_MHD_add_global_headers (resp);
  {
    char *sig_s;
    char *etag;

    sig_s = GNUNET_STRINGS_data_to_string_alloc (&account_sig,
                                                 sizeof (account_sig));
    etag = GNUNET_STRINGS_data_to_string_alloc (&recovery_data_hash,
                                                sizeof (recovery_data_hash));
    GNUNET_break (MHD_YES ==
                  MHD_add_response_header (resp,
                                           ANASTASIS_HTTP_HEADER_POLICY_SIGNATURE,
                                           sig_s));
    GNUNET_break (MHD_YES ==
                  MHD_add_response_header (resp,
                                           ANASTASIS_HTTP_HEADER_POLICY_VERSION,
                                           version_s));
    GNUNET_break (MHD_YES ==
                  MHD_add_response_header (resp,
                                           MHD_HTTP_HEADER_ETAG,
                                           etag));
    GNUNET_free (etag);
    GNUNET_free (sig_s);
  }
  {
    MHD_RESULT ret;

    ret = MHD_queue_response (connection,
                              MHD_HTTP_OK,
                              resp);
    MHD_destroy_response (resp);
    return ret;
  }
}


MHD_RESULT
AH_policy_get (struct MHD_Connection *connection,
               const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub)
{
  struct GNUNET_HashCode recovery_data_hash;
  enum ANASTASIS_DB_AccountStatus as;
  MHD_RESULT ret;
  uint32_t version;
  struct GNUNET_TIME_Absolute expiration;

  as = db->lookup_account (db->cls,
                           account_pub,
                           &expiration,
                           &recovery_data_hash,
                           &version);
  switch (as)
  {
  case ANASTASIS_DB_ACCOUNT_STATUS_PAYMENT_REQUIRED:
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_NOT_FOUND,
                                       TALER_EC_SYNC_ACCOUNT_UNKNOWN,
                                       NULL);
  case ANASTASIS_DB_ACCOUNT_STATUS_HARD_ERROR:
    GNUNET_break (0);
    return TALER_MHD_reply_with_error (connection,
                                       MHD_HTTP_INTERNAL_SERVER_ERROR,
                                       TALER_EC_GENERIC_DB_FETCH_FAILED,
                                       "lookup account");
  case ANASTASIS_DB_ACCOUNT_STATUS_NO_RESULTS:
    {
      struct MHD_Response *resp;

      resp = MHD_create_response_from_buffer (0,
                                              NULL,
                                              MHD_RESPMEM_PERSISTENT);
      TALER_MHD_add_global_headers (resp);
      ret = MHD_queue_response (connection,
                                MHD_HTTP_NO_CONTENT,
                                resp);
      MHD_destroy_response (resp);
    }
    return ret;
  case ANASTASIS_DB_ACCOUNT_STATUS_VALID_HASH_RETURNED:
    {
      const char *inm;

      inm = MHD_lookup_connection_value (connection,
                                         MHD_HEADER_KIND,
                                         MHD_HTTP_HEADER_IF_NONE_MATCH);
      if (NULL != inm)
      {
        struct GNUNET_HashCode inm_h;

        if (GNUNET_OK !=
            GNUNET_STRINGS_string_to_data (inm,
                                           strlen (inm),
                                           &inm_h,
                                           sizeof (inm_h)))
        {
          GNUNET_break_op (0);
          return TALER_MHD_reply_with_error (connection,
                                             MHD_HTTP_BAD_REQUEST,
                                             TALER_EC_ANASTASIS_POLICY_BAD_IF_NONE_MATCH,
                                             "Etag must be a base32-encoded SHA-512 hash");
        }
        if (0 == GNUNET_memcmp (&inm_h,
                                &recovery_data_hash))
        {
          struct MHD_Response *resp;

          resp = MHD_create_response_from_buffer (0,
                                                  NULL,
                                                  MHD_RESPMEM_PERSISTENT);
          TALER_MHD_add_global_headers (resp);
          ret = MHD_queue_response (connection,
                                    MHD_HTTP_NOT_MODIFIED,
                                    resp);
          MHD_destroy_response (resp);
          return ret;
        }
      }
    }
    /* We have a result, should fetch and return it! */
    break;
  }
  return return_policy (connection,
                        account_pub);
}
