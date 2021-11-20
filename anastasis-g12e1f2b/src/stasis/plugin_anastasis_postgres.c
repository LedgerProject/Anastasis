/*
  This file is part of Anastasis
  Copyright (C) 2020, 2021 Anastasis SARL

  Anastasis is free software; you can redistribute it and/or modify it under the
  terms of the GNU Affero General Public License as published by the Free Software
  Foundation; either version 3, or (at your option) any later version.

  Anastasis is distributed in the hope that it will be useful, but WITHOUT ANY
  WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
  A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License along with
  Anastasis; see the file COPYING.GPL.  If not, see <http://www.gnu.org/licenses/>
*/
/**
 * @file stasis/plugin_anastasis_postgres.c
 * @brief database helper functions for postgres used by the anastasis
 * @author Sree Harsha Totakura <sreeharsha@totakura.in>
 * @author Christian Grothoff
 * @author Marcello Stanisci
 */
#include "platform.h"
#include "anastasis_database_plugin.h"
#include "anastasis_database_lib.h"
#include <taler/taler_pq_lib.h>

/**
 * How long do we keep transient accounts open (those that have
 * not been paid at all, but are awaiting payment). This puts
 * a cap on how long users have to make a payment after a payment
 * request was generated.
 */
#define TRANSIENT_LIFETIME GNUNET_TIME_UNIT_WEEKS

/**
 * How often do we re-try if we run into a DB serialization error?
 */
#define MAX_RETRIES 3

/**
 * Maximum value allowed for nonces. Limited to 2^52 to ensure the
 * numeric value survives a conversion to float by JavaScript.
 */
#define NONCE_MAX_VALUE (1LLU << 52)


/**
 * Type of the "cls" argument given to each of the functions in
 * our API.
 */
struct PostgresClosure
{

  /**
   * Postgres connection handle.
   */
  struct GNUNET_PQ_Context *conn;

  /**
   * Underlying configuration.
   */
  const struct GNUNET_CONFIGURATION_Handle *cfg;

  /**
   * Name of the currently active transaction, NULL if none is active.
   */
  const char *transaction_name;

  /**
   * Currency we accept payments in.
   */
  char *currency;

  /**
   * Prepared statements have been initialized.
   */
  bool init;
};


/**
 * Drop anastasis tables
 *
 * @param cls closure our `struct Plugin`
 * @return #GNUNET_OK upon success; #GNUNET_SYSERR upon failure
 */
static enum GNUNET_GenericReturnValue
postgres_drop_tables (void *cls)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_Context *conn;

  conn = GNUNET_PQ_connect_with_cfg (pg->cfg,
                                     "stasis-postgres",
                                     "drop",
                                     NULL,
                                     NULL);
  if (NULL == conn)
    return GNUNET_SYSERR;
  GNUNET_PQ_disconnect (conn);
  return GNUNET_OK;
}


/**
 * Initialize tables.
 *
 * @param cls the `struct PostgresClosure` with the plugin-specific state
 * @return #GNUNET_OK upon success; #GNUNET_SYSERR upon failure
 */
static enum GNUNET_GenericReturnValue
postgres_create_tables (void *cls)
{
  struct PostgresClosure *pc = cls;
  struct GNUNET_PQ_Context *conn;

  conn = GNUNET_PQ_connect_with_cfg (pc->cfg,
                                     "stasis-postgres",
                                     "stasis-",
                                     NULL,
                                     NULL);
  if (NULL == conn)
    return GNUNET_SYSERR;
  GNUNET_PQ_disconnect (conn);
  return GNUNET_OK;
}


/**
 * Establish connection to the database.
 *
 * @param cls plugin context
 * @return #GNUNET_OK upon success; #GNUNET_SYSERR upon failure
 */
static enum GNUNET_GenericReturnValue
prepare_statements (void *cls)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_PreparedStatement ps[] = {
    GNUNET_PQ_make_prepare ("user_insert",
                            "INSERT INTO anastasis_user "
                            "(user_id"
                            ",expiration_date"
                            ") VALUES "
                            "($1, $2);",
                            2),
    GNUNET_PQ_make_prepare ("do_commit",
                            "COMMIT",
                            0),
    GNUNET_PQ_make_prepare ("user_select",
                            "SELECT"
                            " expiration_date "
                            "FROM anastasis_user"
                            " WHERE user_id=$1"
                            " FOR UPDATE;",
                            1),
    GNUNET_PQ_make_prepare ("user_update",
                            "UPDATE anastasis_user"
                            " SET "
                            " expiration_date=$1"
                            " WHERE user_id=$2;",
                            2),
    GNUNET_PQ_make_prepare ("recdoc_payment_insert",
                            "INSERT INTO anastasis_recdoc_payment "
                            "(user_id"
                            ",post_counter"
                            ",amount_val"
                            ",amount_frac"
                            ",payment_identifier"
                            ",creation_date"
                            ") VALUES "
                            "($1, $2, $3, $4, $5, $6);",
                            6),
    GNUNET_PQ_make_prepare ("challenge_payment_insert",
                            "INSERT INTO anastasis_challenge_payment "
                            "(truth_uuid"
                            ",amount_val"
                            ",amount_frac"
                            ",payment_identifier"
                            ",creation_date"
                            ") VALUES "
                            "($1, $2, $3, $4, $5);",
                            5),
    GNUNET_PQ_make_prepare ("truth_payment_insert",
                            "INSERT INTO anastasis_truth_payment "
                            "(truth_uuid"
                            ",amount_val"
                            ",amount_frac"
                            ",expiration"
                            ") VALUES "
                            "($1, $2, $3, $4);",
                            4),
    GNUNET_PQ_make_prepare ("recdoc_payment_done",
                            "UPDATE anastasis_recdoc_payment "
                            "SET"
                            " paid=TRUE "
                            "WHERE"
                            "  payment_identifier=$1"
                            " AND"
                            "  user_id=$2"
                            " AND"
                            "  paid=FALSE;",
                            2),
    GNUNET_PQ_make_prepare ("challenge_refund_update",
                            "UPDATE anastasis_challenge_payment "
                            "SET"
                            " refunded=TRUE "
                            "WHERE"
                            "  payment_identifier=$1"
                            " AND"
                            "  paid=TRUE"
                            " AND"
                            "  truth_uuid=$2;",
                            2),
    GNUNET_PQ_make_prepare ("challenge_payment_done",
                            "UPDATE anastasis_challenge_payment "
                            "SET"
                            " paid=TRUE "
                            "WHERE"
                            "  payment_identifier=$1"
                            " AND"
                            "  refunded=FALSE"
                            " AND"
                            "  truth_uuid=$2"
                            " AND"
                            "  paid=FALSE;",
                            2),
    GNUNET_PQ_make_prepare ("recdoc_payment_select",
                            "SELECT"
                            " creation_date"
                            ",post_counter"
                            ",amount_val"
                            ",amount_frac"
                            ",paid"
                            " FROM anastasis_recdoc_payment"
                            " WHERE payment_identifier=$1;",
                            1),
    GNUNET_PQ_make_prepare ("truth_payment_select",
                            "SELECT"
                            " expiration"
                            " FROM anastasis_truth_payment"
                            " WHERE truth_uuid=$1"
                            "   AND expiration>$2;",
                            2),
    GNUNET_PQ_make_prepare ("challenge_payment_select",
                            "SELECT"
                            " creation_date"
                            ",amount_val"
                            ",amount_frac"
                            ",paid"
                            " FROM anastasis_challenge_payment"
                            " WHERE payment_identifier=$1"
                            "   AND truth_uuid=$2"
                            "   AND refunded=FALSE"
                            "   AND counter>0;",
                            1),
    GNUNET_PQ_make_prepare ("challenge_pending_payment_select",
                            "SELECT"
                            " creation_date"
                            ",payment_identifier"
                            ",amount_val"
                            ",amount_frac"
                            " FROM anastasis_challenge_payment"
                            " WHERE"
                            "  paid=FALSE"
                            " AND"
                            "  refunded=FALSE"
                            " AND"
                            "  truth_uuid=$1"
                            " AND"
                            "  creation_date > $2;",
                            1),
    GNUNET_PQ_make_prepare ("recdoc_payments_select",
                            "SELECT"
                            " user_id"
                            ",payment_identifier"
                            ",amount_val"
                            ",amount_frac"
                            " FROM anastasis_recdoc_payment"
                            " WHERE paid=FALSE;",
                            0),
    GNUNET_PQ_make_prepare ("gc_accounts",
                            "DELETE FROM anastasis_user "
                            "WHERE"
                            " expiration_date < $1;",
                            1),
    GNUNET_PQ_make_prepare ("gc_recdoc_pending_payments",
                            "DELETE FROM anastasis_recdoc_payment "
                            "WHERE"
                            "  paid=FALSE"
                            " AND"
                            "  creation_date < $1;",
                            1),
    GNUNET_PQ_make_prepare ("gc_challenge_pending_payments",
                            "DELETE FROM anastasis_challenge_payment "
                            "WHERE"
                            "  (paid=FALSE"
                            "   OR"
                            "   refunded=TRUE)"
                            " AND"
                            "  creation_date < $1;",
                            1),
    GNUNET_PQ_make_prepare ("truth_insert",
                            "INSERT INTO anastasis_truth "
                            "(truth_uuid"
                            ",key_share_data"
                            ",method_name"
                            ",encrypted_truth"
                            ",truth_mime"
                            ",expiration"
                            ") VALUES "
                            "($1, $2, $3, $4, $5, $6);",
                            6),

    GNUNET_PQ_make_prepare ("test_auth_iban_payment",
                            "SELECT"
                            " credit_val"
                            ",credit_frac"
                            ",wire_subject"
                            " FROM anastasis_auth_iban_in"
                            " WHERE debit_account_details=$1"
                            "  AND execution_date>=$2;",
                            2),
    GNUNET_PQ_make_prepare ("store_auth_iban_payment_details",
                            "INSERT INTO anastasis_auth_iban_in "
                            "(wire_reference"
                            ",wire_subject"
                            ",credit_val"
                            ",credit_frac"
                            ",debit_account_details"
                            ",credit_account_details"
                            ",execution_date"
                            ") VALUES "
                            "($1, $2, $3, $4, $5, $6, $7);",
                            7),


    GNUNET_PQ_make_prepare ("recovery_document_insert",
                            "INSERT INTO anastasis_recoverydocument "
                            "(user_id"
                            ",version"
                            ",account_sig"
                            ",recovery_data_hash"
                            ",recovery_data"
                            ") VALUES "
                            "($1, $2, $3, $4, $5);",
                            5),
    GNUNET_PQ_make_prepare ("truth_select",
                            "SELECT "
                            " method_name"
                            ",encrypted_truth"
                            ",truth_mime"
                            " FROM anastasis_truth"
                            " WHERE truth_uuid =$1;",
                            1),
    GNUNET_PQ_make_prepare ("latest_recoverydocument_select",
                            "SELECT "
                            " version"
                            ",account_sig"
                            ",recovery_data_hash"
                            ",recovery_data"
                            " FROM anastasis_recoverydocument"
                            " WHERE user_id =$1 "
                            " ORDER BY version DESC"
                            " LIMIT 1;",
                            1),
    GNUNET_PQ_make_prepare ("latest_recovery_version_select",
                            "SELECT"
                            " version"
                            ",recovery_data_hash"
                            ",expiration_date"
                            " FROM anastasis_recoverydocument"
                            " JOIN anastasis_user USING (user_id)"
                            " WHERE user_id=$1"
                            " ORDER BY version DESC"
                            " LIMIT 1;",
                            1),
    GNUNET_PQ_make_prepare ("recoverydocument_select",
                            "SELECT "
                            " account_sig"
                            ",recovery_data_hash"
                            ",recovery_data"
                            " FROM anastasis_recoverydocument"
                            " WHERE user_id=$1"
                            " AND version=$2;",
                            2),
    GNUNET_PQ_make_prepare ("postcounter_select",
                            "SELECT"
                            " post_counter"
                            " FROM anastasis_recdoc_payment"
                            " WHERE user_id=$1"
                            "  AND payment_identifier=$2;",
                            2),
    GNUNET_PQ_make_prepare ("postcounter_update",
                            "UPDATE "
                            "anastasis_recdoc_payment "
                            "SET "
                            "post_counter=$1 "
                            "WHERE user_id =$2 "
                            "AND payment_identifier=$3;",
                            3),
    GNUNET_PQ_make_prepare ("key_share_select",
                            "SELECT "
                            "key_share_data "
                            "FROM "
                            "anastasis_truth "
                            "WHERE truth_uuid =$1;",
                            1),
    GNUNET_PQ_make_prepare ("challengecode_insert",
                            "INSERT INTO anastasis_challengecode "
                            "(truth_uuid"
                            ",code"
                            ",creation_date"
                            ",expiration_date"
                            ",retry_counter"
                            ") VALUES "
                            "($1, $2, $3, $4, $5);",
                            5),
    GNUNET_PQ_make_prepare ("challengecode_select",
                            "SELECT "
                            " code"
                            ",satisfied"
                            " FROM anastasis_challengecode"
                            " WHERE truth_uuid=$1"
                            "   AND expiration_date > $2"
                            "   AND retry_counter != 0;",
                            2),
    GNUNET_PQ_make_prepare ("challengecode_set_satisfied",
                            "UPDATE anastasis_challengecode"
                            " SET satisfied=TRUE"
                            " WHERE truth_uuid=$1"
                            "   AND code=$2"
                            "   AND creation_date IN"
                            " (SELECT creation_date"
                            "    FROM anastasis_challengecode"
                            "   WHERE truth_uuid=$1"
                            "     AND code=$2"
                            "    ORDER BY creation_date DESC"
                            "     LIMIT 1);",
                            2),
    GNUNET_PQ_make_prepare ("challengecode_test_satisfied",
                            "SELECT 1 FROM anastasis_challengecode"
                            " WHERE truth_uuid=$1"
                            "   AND satisfied=TRUE"
                            "   AND code=$2"
                            "   AND creation_date >= $3"
                            " LIMIT 1;",
                            3),
    GNUNET_PQ_make_prepare ("challengecode_select_meta",
                            "SELECT "
                            " code"
                            ",retry_counter"
                            ",retransmission_date"
                            " FROM anastasis_challengecode"
                            " WHERE truth_uuid=$1"
                            "   AND expiration_date > $2"
                            "   AND creation_date > $3"
                            " ORDER BY creation_date DESC"
                            " LIMIT 1;",
                            2),
    GNUNET_PQ_make_prepare ("challengecode_update_retry",
                            "UPDATE anastasis_challengecode"
                            " SET retry_counter=retry_counter - 1"
                            " WHERE truth_uuid=$1"
                            "   AND code=$2"
                            "   AND retry_counter != 0;",
                            1),
    GNUNET_PQ_make_prepare ("challengepayment_dec_counter",
                            "UPDATE anastasis_challenge_payment"
                            " SET counter=counter - 1"
                            " WHERE truth_uuid=$1"
                            "   AND payment_identifier=$2"
                            "   AND counter > 0;",
                            2),
    GNUNET_PQ_make_prepare ("challengecode_mark_sent",
                            "UPDATE anastasis_challengecode"
                            " SET retransmission_date=$3"
                            " WHERE truth_uuid=$1"
                            "   AND code=$2"
                            "   AND creation_date IN"
                            " (SELECT creation_date"
                            "    FROM anastasis_challengecode"
                            "   WHERE truth_uuid=$1"
                            "     AND code=$2"
                            "    ORDER BY creation_date DESC"
                            "     LIMIT 1);",
                            3),
    GNUNET_PQ_make_prepare ("get_last_auth_iban_payment",
                            "SELECT "
                            " wire_reference"
                            " FROM anastasis_auth_iban_in"
                            " WHERE credit_account_details=$1"
                            " ORDER BY wire_reference DESC"
                            " LIMIT 1;",
                            1),
    GNUNET_PQ_make_prepare ("gc_challengecodes",
                            "DELETE FROM anastasis_challengecode "
                            "WHERE "
                            "expiration_date < $1;",
                            1),
    GNUNET_PQ_PREPARED_STATEMENT_END
  };

  {
    enum GNUNET_GenericReturnValue ret;

    ret = GNUNET_PQ_prepare_statements (pg->conn,
                                        ps);
    if (GNUNET_OK != ret)
      return ret;
    pg->init = true;
    return GNUNET_OK;
  }
}


/**
 * Check that the database connection is still up.
 *
 * @param cls a `struct PostgresClosure` with connection to check
 */
static void
check_connection (void *cls)
{
  struct PostgresClosure *pg = cls;

  GNUNET_PQ_reconnect_if_down (pg->conn);
}


/**
 * Connect to the database if the connection does not exist yet.
 *
 * @param pg the plugin-specific state
 * @param skip_prepare true if we should skip prepared statement setup
 * @return #GNUNET_OK on success
 */
static enum GNUNET_GenericReturnValue
internal_setup (struct PostgresClosure *pg,
                bool skip_prepare)
{
  if (NULL == pg->conn)
  {
#if AUTO_EXPLAIN
    /* Enable verbose logging to see where queries do not
       properly use indices */
    struct GNUNET_PQ_ExecuteStatement es[] = {
      GNUNET_PQ_make_try_execute ("LOAD 'auto_explain';"),
      GNUNET_PQ_make_try_execute ("SET auto_explain.log_min_duration=50;"),
      GNUNET_PQ_make_try_execute ("SET auto_explain.log_timing=TRUE;"),
      GNUNET_PQ_make_try_execute ("SET auto_explain.log_analyze=TRUE;"),
      /* https://wiki.postgresql.org/wiki/Serializable suggests to really
         force the default to 'serializable' if SSI is to be used. */
      GNUNET_PQ_make_try_execute (
        "SET SESSION CHARACTERISTICS AS TRANSACTION ISOLATION LEVEL SERIALIZABLE;"),
      GNUNET_PQ_make_try_execute ("SET enable_sort=OFF;"),
      GNUNET_PQ_make_try_execute ("SET enable_seqscan=OFF;"),
      GNUNET_PQ_EXECUTE_STATEMENT_END
    };
#else
    struct GNUNET_PQ_ExecuteStatement *es = NULL;
#endif
    struct GNUNET_PQ_Context *db_conn;

    db_conn = GNUNET_PQ_connect_with_cfg (pg->cfg,
                                          "stasis-postgres",
                                          NULL,
                                          es,
                                          NULL);
    if (NULL == db_conn)
      return GNUNET_SYSERR;
    pg->conn = db_conn;
  }
  if (NULL == pg->transaction_name)
    GNUNET_PQ_reconnect_if_down (pg->conn);
  if (pg->init)
    return GNUNET_OK;
  if (skip_prepare)
    return GNUNET_OK;
  return prepare_statements (pg);
}


/**
 * Do a pre-flight check that we are not in an uncommitted transaction.
 * If we are, try to commit the previous transaction and output a warning.
 * Does not return anything, as we will continue regardless of the outcome.
 *
 * @param cls the `struct PostgresClosure` with the plugin-specific state
 * @return #GNUNET_OK if everything is fine
 *         #GNUNET_NO if a transaction was rolled back
 *         #GNUNET_SYSERR on hard errors
 */
static enum GNUNET_GenericReturnValue
postgres_preflight (void *cls)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_ExecuteStatement es[] = {
    GNUNET_PQ_make_execute ("ROLLBACK"),
    GNUNET_PQ_EXECUTE_STATEMENT_END
  };

  if (! pg->init)
  {
    if (GNUNET_OK !=
        internal_setup (pg,
                        false))
      return GNUNET_SYSERR;
  }
  if (NULL == pg->transaction_name)
    return GNUNET_OK;  /* all good */
  if (GNUNET_OK ==
      GNUNET_PQ_exec_statements (pg->conn,
                                 es))
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "BUG: Preflight check rolled back transaction `%s'!\n",
                pg->transaction_name);
  }
  else
  {
    GNUNET_log (GNUNET_ERROR_TYPE_ERROR,
                "BUG: Preflight check failed to rollback transaction `%s'!\n",
                pg->transaction_name);
  }
  pg->transaction_name = NULL;
  return GNUNET_NO;
}


/**
 * Start a transaction.
 *
 * @param cls the `struct PostgresClosure` with the plugin-specific state
 * @param name unique name identifying the transaction (for debugging),
 *             must point to a constant
 * @return #GNUNET_OK on success
 */
static int
begin_transaction (void *cls,
                   const char *name)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_ExecuteStatement es[] = {
    GNUNET_PQ_make_execute ("START TRANSACTION ISOLATION LEVEL SERIALIZABLE"),
    GNUNET_PQ_EXECUTE_STATEMENT_END
  };

  check_connection (pg);
  GNUNET_break (GNUNET_OK ==
                postgres_preflight (pg));
  pg->transaction_name = name;
  if (GNUNET_OK !=
      GNUNET_PQ_exec_statements (pg->conn,
                                 es))
  {
    TALER_LOG_ERROR ("Failed to start transaction\n");
    GNUNET_break (0);
    return GNUNET_SYSERR;
  }
  return GNUNET_OK;
}


/**
* Roll back the current transaction of a database connection.
*
* @param cls the `struct PostgresClosure` with the plugin-specific state
* @return #GNUNET_OK on success
*/
static void
rollback (void *cls)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_ExecuteStatement es[] = {
    GNUNET_PQ_make_execute ("ROLLBACK"),
    GNUNET_PQ_EXECUTE_STATEMENT_END
  };

  if (GNUNET_OK !=
      GNUNET_PQ_exec_statements (pg->conn,
                                 es))
  {
    TALER_LOG_ERROR ("Failed to rollback transaction\n");
    GNUNET_break (0);
  }
  pg->transaction_name = NULL;
}


/**
 * Commit the current transaction of a database connection.
 *
 * @param cls the `struct PostgresClosure` with the plugin-specific state
 * @return transaction status code
 */
static enum GNUNET_DB_QueryStatus
commit_transaction (void *cls)
{
  struct PostgresClosure *pg = cls;
  enum GNUNET_DB_QueryStatus qs;
  struct GNUNET_PQ_QueryParam no_params[] = {
    GNUNET_PQ_query_param_end
  };

  qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                           "do_commit",
                                           no_params);
  pg->transaction_name = NULL;
  return qs;
}


/**
 * Register callback to be invoked on events of type @a es.
 *
 * @param cls database context to use
 * @param es specification of the event to listen for
 * @param timeout how long to wait for the event
 * @param cb function to call when the event happens, possibly
 *         multiple times (until cancel is invoked)
 * @param cb_cls closure for @a cb
 * @return handle useful to cancel the listener
 */
static struct GNUNET_DB_EventHandler *
postgres_event_listen (void *cls,
                       const struct GNUNET_DB_EventHeaderP *es,
                       struct GNUNET_TIME_Relative timeout,
                       GNUNET_DB_EventCallback cb,
                       void *cb_cls)
{
  struct PostgresClosure *pg = cls;

  return GNUNET_PQ_event_listen (pg->conn,
                                 es,
                                 timeout,
                                 cb,
                                 cb_cls);
}


/**
 * Stop notifications.
 *
 * @param eh handle to unregister.
 */
static void
postgres_event_listen_cancel (struct GNUNET_DB_EventHandler *eh)
{
  GNUNET_PQ_event_listen_cancel (eh);
}


/**
 * Notify all that listen on @a es of an event.
 *
 * @param cls database context to use
 * @param es specification of the event to generate
 * @param extra additional event data provided
 * @param extra_size number of bytes in @a extra
 */
static void
postgres_event_notify (void *cls,
                       const struct GNUNET_DB_EventHeaderP *es,
                       const void *extra,
                       size_t extra_size)
{
  struct PostgresClosure *pg = cls;

  return GNUNET_PQ_event_notify (pg->conn,
                                 es,
                                 extra,
                                 extra_size);
}


/**
 * Function called to perform "garbage collection" on the
 * database, expiring records we no longer require.  Deletes
 * all user records that are not paid up (and by cascade deletes
 * the associated recovery documents). Also deletes expired
 * truth and financial records older than @a fin_expire.
 *
 * @param cls closure
 * @param expire_backups backups older than the given time stamp should be garbage collected
 * @param expire_pending_payments payments still pending from since before
 *            this value should be garbage collected
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_gc (void *cls,
             struct GNUNET_TIME_Absolute expire_backups,
             struct GNUNET_TIME_Absolute expire_pending_payments)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_absolute_time (&expire_backups),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_QueryParam params2[] = {
    GNUNET_PQ_query_param_absolute_time (&expire_pending_payments),
    GNUNET_PQ_query_param_end
  };
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  GNUNET_break (GNUNET_OK ==
                postgres_preflight (pg));
  qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                           "gc_accounts",
                                           params);
  if (qs < 0)
    return qs;
  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "gc_recdoc_pending_payments",
                                             params2);
}


/**
 * Store encrypted recovery document.
 *
 * @param cls closure
 * @param account_pub public key of the user's account
 * @param account_sig signature affirming storage request
 * @param recovery_data_hash hash of @a data
 * @param recovery_data contains encrypted_recovery_document
 * @param recovery_data_size size of data blob
 * @param payment_secret identifier for the payment, used to later charge on uploads
 * @param[out] version set to the version assigned to the document by the database
 * @return transaction status, 0 if upload could not be finished because @a payment_secret
 *         did not have enough upload left; HARD error if @a payment_secret is unknown, ...
 */
static enum ANASTASIS_DB_StoreStatus
postgres_store_recovery_document (
  void *cls,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  const struct ANASTASIS_AccountSignatureP *account_sig,
  const struct GNUNET_HashCode *recovery_data_hash,
  const void *recovery_data,
  size_t recovery_data_size,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  uint32_t *version)
{
  struct PostgresClosure *pg = cls;
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  GNUNET_break (GNUNET_OK ==
                postgres_preflight (pg));
  for (unsigned int retry = 0; retry<MAX_RETRIES; retry++)
  {
    if (GNUNET_OK !=
        begin_transaction (pg,
                           "store_recovery_document"))
    {
      GNUNET_break (0);
      return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
    }
    /* get the current version and hash of the latest recovery document
       for this account */
    {
      struct GNUNET_HashCode dh;
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (account_pub),
        GNUNET_PQ_query_param_end
      };
      struct GNUNET_PQ_ResultSpec rs[] = {
        GNUNET_PQ_result_spec_uint32 ("version",
                                      version),
        GNUNET_PQ_result_spec_auto_from_type ("recovery_data_hash",
                                              &dh),
        GNUNET_PQ_result_spec_end
      };

      qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                     "latest_recovery_version_select",
                                                     params,
                                                     rs);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        GNUNET_break (0);
        rollback (pg);
        return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        goto retry;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        *version = 1;
        break;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        /* had an existing recovery_data, is it identical? */
        if (0 == GNUNET_memcmp (&dh,
                                recovery_data_hash))
        {
          /* Yes. Previous identical recovery data exists */
          rollback (pg);
          return ANASTASIS_DB_STORE_STATUS_NO_RESULTS;
        }
        (*version)++;
        break;
      default:
        GNUNET_break (0);
        rollback (pg);
        return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
      }
    }

    /* First, check if account exists */
    {
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (account_pub),
        GNUNET_PQ_query_param_end
      };
      struct GNUNET_PQ_ResultSpec rs[] = {
        GNUNET_PQ_result_spec_end
      };

      qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                     "user_select",
                                                     params,
                                                     rs);
    }
    switch (qs)
    {
    case GNUNET_DB_STATUS_HARD_ERROR:
      rollback (pg);
      return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
    case GNUNET_DB_STATUS_SOFT_ERROR:
      goto retry;
    case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
      rollback (pg);
      return ANASTASIS_DB_STORE_STATUS_PAYMENT_REQUIRED;
    case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
      /* handle interesting case below */
      break;
    }

    {
      uint32_t postcounter;

      /* lookup if the user has enough uploads left and decrement */
      {
        struct GNUNET_PQ_QueryParam params[] = {
          GNUNET_PQ_query_param_auto_from_type (account_pub),
          GNUNET_PQ_query_param_auto_from_type (payment_secret),
          GNUNET_PQ_query_param_end
        };
        struct GNUNET_PQ_ResultSpec rs[] = {
          GNUNET_PQ_result_spec_uint32 ("post_counter",
                                        &postcounter),
          GNUNET_PQ_result_spec_end
        };

        qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                       "postcounter_select",
                                                       params,
                                                       rs);
        switch (qs)
        {
        case GNUNET_DB_STATUS_HARD_ERROR:
          rollback (pg);
          return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
        case GNUNET_DB_STATUS_SOFT_ERROR:
          goto retry;
        case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
          rollback (pg);
          return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
        case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
          break;
        }
      }

      if (0 == postcounter)
      {
        rollback (pg);
        return ANASTASIS_DB_STORE_STATUS_STORE_LIMIT_EXCEEDED;
      }
      /* Decrement the postcounter by one */
      postcounter--;

      /* Update the postcounter in the Database */
      {
        struct GNUNET_PQ_QueryParam params[] = {
          GNUNET_PQ_query_param_uint32 (&postcounter),
          GNUNET_PQ_query_param_auto_from_type (account_pub),
          GNUNET_PQ_query_param_auto_from_type (payment_secret),
          GNUNET_PQ_query_param_end
        };

        qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                                 "postcounter_update",
                                                 params);
        switch (qs)
        {
        case GNUNET_DB_STATUS_HARD_ERROR:
          GNUNET_break (0);
          rollback (pg);
          return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
        case GNUNET_DB_STATUS_SOFT_ERROR:
          goto retry;
        case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
          GNUNET_break (0);
          rollback (pg);
          return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
        case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
          break;
        default:
          GNUNET_break (0);
          rollback (pg);
          return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
        }
      }
    }

    /* finally, actually insert the recovery document */
    {
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (account_pub),
        GNUNET_PQ_query_param_uint32 (version),
        GNUNET_PQ_query_param_auto_from_type (account_sig),
        GNUNET_PQ_query_param_auto_from_type (recovery_data_hash),
        GNUNET_PQ_query_param_fixed_size (recovery_data,
                                          recovery_data_size),
        GNUNET_PQ_query_param_end
      };

      qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                               "recovery_document_insert",
                                               params);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        rollback (pg);
        return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        goto retry;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        GNUNET_break (0);
        rollback (pg);
        return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        qs = commit_transaction (pg);
        if (GNUNET_DB_STATUS_SOFT_ERROR == qs)
          goto retry;
        if (qs < 0)
          return ANASTASIS_DB_STORE_STATUS_HARD_ERROR;
        return ANASTASIS_DB_STORE_STATUS_SUCCESS;
      }
    }
retry:
    rollback (pg);
  }
  return ANASTASIS_DB_STORE_STATUS_SOFT_ERROR;
}


/**
 * Increment account lifetime.
 *
 * @param cls closure
 * @param account_pub which account received a payment
 * @param payment_identifier proof of payment, must be unique and match pending payment
 * @param lifetime for how long is the account now paid (increment)
 * @param[out] paid_until set to the end of the lifetime after the operation
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_increment_lifetime (
  void *cls,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  const struct ANASTASIS_PaymentSecretP *payment_identifier,
  struct GNUNET_TIME_Relative lifetime,
  struct GNUNET_TIME_Absolute *paid_until)
{
  struct PostgresClosure *pg = cls;
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  for (unsigned int retries = 0; retries<MAX_RETRIES; retries++)
  {
    if (GNUNET_OK !=
        begin_transaction (pg,
                           "increment lifetime"))
    {
      GNUNET_break (0);
      return GNUNET_DB_STATUS_HARD_ERROR;
    }

    {
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (payment_identifier),
        GNUNET_PQ_query_param_auto_from_type (account_pub),
        GNUNET_PQ_query_param_end
      };
      qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                               "recdoc_payment_done",
                                               params);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        rollback (pg);
        *paid_until = GNUNET_TIME_UNIT_ZERO_ABS;
        return qs;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        goto retry;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        /* continued below */
        break;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        /* continued below */
        break;
      }
    }

    {
      enum GNUNET_DB_QueryStatus qs2;
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (account_pub),
        GNUNET_PQ_query_param_end
      };
      struct GNUNET_TIME_Absolute expiration;
      struct GNUNET_PQ_ResultSpec rs[] = {
        GNUNET_PQ_result_spec_absolute_time ("expiration_date",
                                             &expiration),
        GNUNET_PQ_result_spec_end
      };

      qs2 = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                      "user_select",
                                                      params,
                                                      rs);
      switch (qs2)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        rollback (pg);
        return qs2;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        goto retry;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        if (GNUNET_DB_STATUS_SUCCESS_NO_RESULTS == qs)
        {
          /* inconsistent, cannot have recdoc payment but no user!? */
          GNUNET_break (0);
          rollback (pg);
          return GNUNET_DB_STATUS_HARD_ERROR;
        }
        else
        {
          /* user does not exist, create new one */
          struct GNUNET_PQ_QueryParam params[] = {
            GNUNET_PQ_query_param_auto_from_type (account_pub),
            GNUNET_PQ_query_param_absolute_time (&expiration),
            GNUNET_PQ_query_param_end
          };

          expiration = GNUNET_TIME_relative_to_absolute (lifetime);
          GNUNET_break (GNUNET_TIME_UNIT_FOREVER_ABS.abs_value_us !=
                        expiration.abs_value_us);
          *paid_until = expiration;
          qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                                   "user_insert",
                                                   params);
        }
        break;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        if (GNUNET_DB_STATUS_SUCCESS_NO_RESULTS == qs)
        {
          /* existing rec doc payment, return expiration */
          *paid_until = expiration;
          rollback (pg);
          GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                      "Payment existed, lifetime of account %s unchanged at %s\n",
                      TALER_B2S (account_pub),
                      GNUNET_STRINGS_absolute_time_to_string (*paid_until));
          return GNUNET_DB_STATUS_SUCCESS_NO_RESULTS;
        }
        else
        {
          /* user exists, update expiration_date */
          struct GNUNET_PQ_QueryParam params[] = {
            GNUNET_PQ_query_param_absolute_time (&expiration),
            GNUNET_PQ_query_param_auto_from_type (account_pub),
            GNUNET_PQ_query_param_end
          };

          expiration = GNUNET_TIME_absolute_add (expiration,
                                                 lifetime);
          GNUNET_break (GNUNET_TIME_UNIT_FOREVER_ABS.abs_value_us !=
                        expiration.abs_value_us);
          *paid_until = expiration;
          qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                                   "user_update",
                                                   params);
        }
        break;
      }
    }

    switch (qs)
    {
    case GNUNET_DB_STATUS_HARD_ERROR:
      rollback (pg);
      return qs;
    case GNUNET_DB_STATUS_SOFT_ERROR:
      goto retry;
    case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
      GNUNET_break (0);
      rollback (pg);
      return GNUNET_DB_STATUS_HARD_ERROR;
    case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
      break;
    }
    qs = commit_transaction (pg);
    if (GNUNET_DB_STATUS_SOFT_ERROR == qs)
      goto retry;
    if (qs < 0)
      return GNUNET_DB_STATUS_HARD_ERROR;
    GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                "Incremented lifetime of account %s to %s\n",
                TALER_B2S (account_pub),
                GNUNET_STRINGS_absolute_time_to_string (*paid_until));
    return GNUNET_DB_STATUS_SUCCESS_ONE_RESULT;
retry:
    rollback (pg);
  }
  return GNUNET_DB_STATUS_SOFT_ERROR;
}


/**
 * Update account lifetime to the maximum of the current
 * value and @a eol.
 *
 * @param cls closure
 * @param account_pub which account received a payment
 * @param payment_identifier proof of payment, must be unique and match pending payment
 * @param eol for how long is the account now paid (absolute)
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_update_lifetime (
  void *cls,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  const struct ANASTASIS_PaymentSecretP *payment_identifier,
  struct GNUNET_TIME_Absolute eol)
{
  struct PostgresClosure *pg = cls;
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  for (unsigned int retries = 0; retries<MAX_RETRIES; retries++)
  {
    if (GNUNET_OK !=
        begin_transaction (pg,
                           "update lifetime"))
    {
      GNUNET_break (0);
      return GNUNET_DB_STATUS_HARD_ERROR;
    }

    {
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (payment_identifier),
        GNUNET_PQ_query_param_auto_from_type (account_pub),
        GNUNET_PQ_query_param_end
      };
      qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                               "recdoc_payment_done",
                                               params);
      if (GNUNET_DB_STATUS_SOFT_ERROR == qs)
        goto retry;
      if (0 >= qs)
      {
        /* same payment made before, or unknown, or error
           => no further action! */
        rollback (pg);
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Payment existed, lifetime of account %s unchanged\n",
                    TALER_B2S (account_pub));
        return qs;
      }
    }

    {
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (account_pub),
        GNUNET_PQ_query_param_end
      };
      struct GNUNET_TIME_Absolute expiration;
      struct GNUNET_PQ_ResultSpec rs[] = {
        GNUNET_PQ_result_spec_absolute_time ("expiration_date",
                                             &expiration),
        GNUNET_PQ_result_spec_end
      };

      qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                     "user_select",
                                                     params,
                                                     rs);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        rollback (pg);
        return qs;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        goto retry;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        {
          /* user does not exist, create new one */
          struct GNUNET_PQ_QueryParam params[] = {
            GNUNET_PQ_query_param_auto_from_type (account_pub),
            GNUNET_PQ_query_param_absolute_time (&eol),
            GNUNET_PQ_query_param_end
          };

          GNUNET_break (GNUNET_TIME_UNIT_FOREVER_ABS.abs_value_us !=
                        eol.abs_value_us);
          qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                                   "user_insert",
                                                   params);
          GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                      "Created new account %s with expiration %s\n",
                      TALER_B2S (account_pub),
                      GNUNET_STRINGS_absolute_time_to_string (eol));
        }
        break;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        {
          /* user exists, update expiration_date */
          struct GNUNET_PQ_QueryParam params[] = {
            GNUNET_PQ_query_param_absolute_time (&expiration),
            GNUNET_PQ_query_param_auto_from_type (account_pub),
            GNUNET_PQ_query_param_end
          };

          expiration = GNUNET_TIME_absolute_max (expiration,
                                                 eol);
          GNUNET_break (GNUNET_TIME_UNIT_FOREVER_ABS.abs_value_us !=
                        expiration.abs_value_us);
          qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                                   "user_update",
                                                   params);
          GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                      "Updated account %s to new expiration %s\n",
                      TALER_B2S (account_pub),
                      GNUNET_STRINGS_absolute_time_to_string (expiration));
        }
        break;
      }
    }

    switch (qs)
    {
    case GNUNET_DB_STATUS_HARD_ERROR:
      rollback (pg);
      return qs;
    case GNUNET_DB_STATUS_SOFT_ERROR:
      goto retry;
    case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
      GNUNET_break (0);
      rollback (pg);
      return GNUNET_DB_STATUS_HARD_ERROR;
    case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
      break;
    }
    qs = commit_transaction (pg);
    if (GNUNET_DB_STATUS_SOFT_ERROR == qs)
      goto retry;
    if (qs < 0)
      return GNUNET_DB_STATUS_HARD_ERROR;
    return GNUNET_DB_STATUS_SUCCESS_ONE_RESULT;
retry:
    rollback (pg);
  }
  return GNUNET_DB_STATUS_SOFT_ERROR;
}


/**
 * Store payment. Used to begin a payment, not indicative
 * that the payment actually was made. (That is done
 * when we increment the account's lifetime.)
 *
 * @param cls closure
 * @param account_pub anastasis's public key
 * @param post_counter how many uploads does @a amount pay for
 * @param payment_secret payment secret which the user must provide with every upload
 * @param amount how much we asked for
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_record_recdoc_payment (
  void *cls,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  uint32_t post_counter,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  const struct TALER_Amount *amount)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_TIME_Absolute now = GNUNET_TIME_absolute_get ();
  struct GNUNET_TIME_Absolute expiration;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (account_pub),
    GNUNET_PQ_query_param_uint32 (&post_counter),
    TALER_PQ_query_param_amount (amount),
    GNUNET_PQ_query_param_auto_from_type (payment_secret),
    GNUNET_PQ_query_param_absolute_time (&now),
    GNUNET_PQ_query_param_end
  };
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  GNUNET_break (GNUNET_OK ==
                postgres_preflight (pg));

  /* because of constraint at user_id, first we have to verify
     if user exists, and if not, create one */
  {
    struct GNUNET_PQ_QueryParam params[] = {
      GNUNET_PQ_query_param_auto_from_type (account_pub),
      GNUNET_PQ_query_param_end
    };
    struct GNUNET_PQ_ResultSpec rs[] = {
      GNUNET_PQ_result_spec_absolute_time ("expiration_date",
                                           &expiration),
      GNUNET_PQ_result_spec_end
    };

    qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "user_select",
                                                   params,
                                                   rs);
  }
  switch (qs)
  {
  case GNUNET_DB_STATUS_HARD_ERROR:
    return qs;
  case GNUNET_DB_STATUS_SOFT_ERROR:
    GNUNET_break (0);
    return GNUNET_DB_STATUS_HARD_ERROR;
  case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
    {
      /* create new user with short lifetime */
      struct GNUNET_TIME_Absolute exp
        = GNUNET_TIME_relative_to_absolute (TRANSIENT_LIFETIME);
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (account_pub),
        GNUNET_PQ_query_param_absolute_time (&exp),
        GNUNET_PQ_query_param_end
      };

      qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                               "user_insert",
                                               params);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        return GNUNET_DB_STATUS_HARD_ERROR;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        GNUNET_break (0);
        return GNUNET_DB_STATUS_HARD_ERROR;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        GNUNET_break (0);
        return GNUNET_DB_STATUS_HARD_ERROR;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        /* successful, continue below */
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Created new account %s with transient life until %s\n",
                    TALER_B2S (account_pub),
                    GNUNET_STRINGS_absolute_time_to_string (exp));
        break;
      }
    }
    /* continue below */
    break;
  case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
    /* handle case below */
    break;
  }

  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "recdoc_payment_insert",
                                             params);
}


/**
 * Record truth upload payment was made.
 *
 * @param cls closure
 * @param uuid the truth's UUID
 * @param amount the amount that was paid
 * @param duration how long is the truth paid for
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_record_truth_upload_payment (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid,
  const struct TALER_Amount *amount,
  struct GNUNET_TIME_Relative duration)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_TIME_Absolute exp = GNUNET_TIME_relative_to_absolute (duration);
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (uuid),
    TALER_PQ_query_param_amount (amount),
    GNUNET_PQ_query_param_absolute_time (&exp),
    GNUNET_PQ_query_param_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "truth_payment_insert",
                                             params);
}


/**
 * Inquire whether truth upload payment was made.
 *
 * @param cls closure
 * @param uuid the truth's UUID
 * @param[out] paid_until set for how long this truth is paid for
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_check_truth_upload_paid (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *uuid,
  struct GNUNET_TIME_Absolute *paid_until)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_TIME_Absolute now = GNUNET_TIME_absolute_get ();
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (uuid),
    GNUNET_PQ_query_param_absolute_time (&now),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_absolute_time ("expiration",
                                         paid_until),
    GNUNET_PQ_result_spec_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "truth_payment_select",
                                                   params,
                                                   rs);
}


/**
 * Store payment for challenge.
 *
 * @param cls closure
 * @param truth_uuid identifier of the challenge to pay
 * @param payment_secret payment secret which the user must provide with every upload
 * @param amount how much we asked for
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_record_challenge_payment (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  const struct TALER_Amount *amount)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_TIME_Absolute now = GNUNET_TIME_absolute_get ();
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    TALER_PQ_query_param_amount (amount),
    GNUNET_PQ_query_param_auto_from_type (payment_secret),
    GNUNET_PQ_query_param_absolute_time (&now),
    GNUNET_PQ_query_param_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "challenge_payment_insert",
                                             params);
}


/**
 * Store refund granted for challenge.
 *
 * @param cls closure
 * @param truth_uuid identifier of the challenge to refund
 * @param payment_secret payment secret which the user must provide with every upload
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_record_challenge_refund (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const struct ANASTASIS_PaymentSecretP *payment_secret)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (payment_secret),
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "challenge_refund_update",
                                             params);
}


/**
 * Store inbound IBAN payment made for authentication.
 *
 * @param cls closure
 * @param wire_reference unique identifier inside LibEuFin/Nexus
 * @param wire_subject subject of the wire transfer
 * @param amount how much was transferred
 * @param debit_account account that was debited
 * @param credit_account Anastasis operator account credited
 * @param execution_date when was the transfer made
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_record_auth_iban_payment (
  void *cls,
  uint64_t wire_reference,
  const char *wire_subject,
  const struct TALER_Amount *amount,
  const char *debit_account,
  const char *credit_account,
  struct GNUNET_TIME_Absolute execution_date)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_uint64 (&wire_reference),
    GNUNET_PQ_query_param_string (wire_subject),
    TALER_PQ_query_param_amount (amount),
    GNUNET_PQ_query_param_string (debit_account),
    GNUNET_PQ_query_param_string (credit_account),
    GNUNET_PQ_query_param_absolute_time (&execution_date),
    GNUNET_PQ_query_param_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "store_auth_iban_payment_details",
                                             params);
}


/**
 * Closure for #test_auth_cb.
 */
struct TestIbanContext
{

  /**
   * Plugin context.
   */
  struct PostgresClosure *pg;

  /**
   * Function to call on each wire transfer found.
   */
  ANASTASIS_DB_AuthIbanTransfercheck cb;

  /**
   * Closure for @a cb.
   */
  void *cb_cls;

  /**
   * Value to return.
   */
  enum GNUNET_DB_QueryStatus qs;
};


/**
 * Helper function for #postgres_test_auth_iban_payment().
 * To be called with the results of a SELECT statement
 * that has returned @a num_results results.
 *
 * @param cls closure of type `struct TestIbanContext *`
 * @param result the postgres result
 * @param num_results the number of results in @a result
 */
static void
test_auth_cb (void *cls,
              PGresult *result,
              unsigned int num_results)
{
  struct TestIbanContext *tic = cls;
  struct PostgresClosure *pg = tic->pg;

  for (unsigned int i = 0; i<num_results; i++)
  {
    struct TALER_Amount credit;
    char *wire_subject;
    struct GNUNET_PQ_ResultSpec rs[] = {
      TALER_PQ_result_spec_amount ("credit",
                                   pg->currency,
                                   &credit),
      GNUNET_PQ_result_spec_string ("wire_subject",
                                    &wire_subject),
      GNUNET_PQ_result_spec_end
    };

    if (GNUNET_OK !=
        GNUNET_PQ_extract_result (result,
                                  rs,
                                  i))
    {
      GNUNET_break (0);
      tic->qs = GNUNET_DB_STATUS_HARD_ERROR;
      return;
    }
    if (tic->cb (tic->cb_cls,
                 &credit,
                 wire_subject))
    {
      GNUNET_free (wire_subject);
      tic->qs = GNUNET_DB_STATUS_SUCCESS_ONE_RESULT;
      return;
    }
    GNUNET_free (wire_subject);
  }
}


/**
 * Function to check if we are aware of a wire transfer
 * that satisfies the IBAN plugin's authentication check.
 *
 * @param cls closure
 * @param debit_account which debit account to check
 * @param earliest_date earliest date to check
 * @param cb function to call on all entries found
 * @param cb_cls closure for @a cb
 * @return transaction status,
 *    #GNUNET_DB_STATUS_SUCCESS_ONE_RESULT if @a cb
 *      returned 'true' once
 *    #GNUNET_DB_STATUS_SUCCESS_NO_RESULTS if no
 *      wire transfers existed for which @a cb returned true
 */
static enum GNUNET_DB_QueryStatus
postgres_test_auth_iban_payment (
  void *cls,
  const char *debit_account,
  struct GNUNET_TIME_Absolute earliest_date,
  ANASTASIS_DB_AuthIbanTransfercheck cb,
  void *cb_cls)
{
  struct PostgresClosure *pg = cls;
  struct TestIbanContext tic = {
    .cb = cb,
    .cb_cls = cb_cls,
    .pg = pg
  };
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_string (debit_account),
    TALER_PQ_query_param_absolute_time (&earliest_date),
    GNUNET_PQ_query_param_end
  };
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  qs = GNUNET_PQ_eval_prepared_multi_select (pg->conn,
                                             "test_auth_iban_payment",
                                             params,
                                             &test_auth_cb,
                                             &tic);
  if (qs < 0)
    return qs;
  return tic.qs;
}


/**
 * Function to check the last known IBAN payment.
 *
 * @param cls closure
 * @param credit_account which credit account to check
 * @param[out] last_row set to the last known row
 * @return transaction status,
 *    #GNUNET_DB_STATUS_SUCCESS_ONE_RESULT if @a cb
 *      returned 'true' once
 *    #GNUNET_DB_STATUS_SUCCESS_NO_RESULTS if no
 *      wire transfers existed for which @a cb returned true
 */
static enum GNUNET_DB_QueryStatus
postgres_get_last_auth_iban_payment_row (
  void *cls,
  const char *credit_account,
  uint64_t *last_row)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_string (credit_account),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_uint64 ("wire_reference",
                                  last_row),
    GNUNET_PQ_result_spec_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "get_last_auth_iban_payment",
                                                   params,
                                                   rs);
}


/**
 * Check payment identifier. Used to check if a payment identifier given by
 * the user is valid (existing and paid).
 *
 * @param cls closure
 * @param payment_secret payment secret which the user must provide with every upload
 * @param truth_uuid which truth should we check the payment status of
 * @param[out] paid bool value to show if payment is paid
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_check_challenge_payment (
  void *cls,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  bool *paid)
{
  struct PostgresClosure *pg = cls;
  uint8_t paid8;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (payment_secret),
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_end
  };
  enum GNUNET_DB_QueryStatus qs;
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_auto_from_type ("paid",
                                          &paid8),
    GNUNET_PQ_result_spec_end
  };

  check_connection (pg);
  qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                 "challenge_payment_select",
                                                 params,
                                                 rs);
  *paid = (0 != paid8);
  return qs;
}


/**
 * Check payment identifier. Used to check if a payment identifier given by
 * the user is valid (existing and paid).
 *
 * @param cls closure
 * @param payment_secret payment secret which the user must provide with every upload
 * @param[out] paid bool value to show if payment is paid
 * @param[out] valid_counter bool value to show if post_counter is > 0
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_check_payment_identifier (
  void *cls,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  bool *paid,
  bool *valid_counter)
{
  struct PostgresClosure *pg = cls;
  uint32_t counter;
  uint8_t paid8;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (payment_secret),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_auto_from_type ("paid",
                                          &paid8),
    GNUNET_PQ_result_spec_uint32 ("post_counter",
                                  &counter),
    GNUNET_PQ_result_spec_end
  };
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                 "recdoc_payment_select",
                                                 params,
                                                 rs);

  if (GNUNET_DB_STATUS_SUCCESS_ONE_RESULT == qs)
  {
    if (counter > 0)
      *valid_counter = true;
    else
      *valid_counter = false;
    *paid = (0 != paid8);
  }
  return qs;
}


/**
 * Upload Truth, which contains the Truth and the KeyShare.
 *
 * @param cls closure
 * @param truth_uuid the identifier for the Truth
 * @param key_share_data contains information of an EncryptedKeyShare
 * @param mime_type presumed mime type of data in @a encrypted_truth
 * @param encrypted_truth contains the encrypted Truth which includes the ground truth i.e. H(challenge answer), phonenumber, SMS
 * @param encrypted_truth_size the size of the Truth
 * @param method name of method
 * @param truth_expiration time till the according data will be stored
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_store_truth (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const struct ANASTASIS_CRYPTO_EncryptedKeyShareP *key_share_data,
  const char *mime_type,
  const void *encrypted_truth,
  size_t encrypted_truth_size,
  const char *method,
  struct GNUNET_TIME_Relative truth_expiration)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_TIME_Absolute expiration = GNUNET_TIME_absolute_get ();
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_auto_from_type (key_share_data),
    GNUNET_PQ_query_param_string (method),
    GNUNET_PQ_query_param_fixed_size (encrypted_truth,
                                      encrypted_truth_size),
    GNUNET_PQ_query_param_string (mime_type),
    TALER_PQ_query_param_absolute_time (&expiration),
    GNUNET_PQ_query_param_end
  };


  expiration = GNUNET_TIME_absolute_add (expiration,
                                         truth_expiration);
  GNUNET_TIME_round_abs (&expiration);
  check_connection (pg);
  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "truth_insert",
                                             params);
}


/**
 * Get the encrypted truth to validate the challenge response
 *
 * @param cls closure
 * @param truth_uuid the identifier for the Truth
 * @param[out] truth contains the encrypted truth
 * @param[out] truth_size size of the encrypted truth
 * @param[out] truth_mime mime type of truth
 * @param[out] method type of the challenge
 * @return transaction status
 */
enum GNUNET_DB_QueryStatus
postgres_get_escrow_challenge (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  void **truth,
  size_t *truth_size,
  char **truth_mime,
  char **method)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_variable_size ("encrypted_truth",
                                         truth,
                                         truth_size),
    GNUNET_PQ_result_spec_string ("truth_mime",
                                  truth_mime),
    GNUNET_PQ_result_spec_string ("method_name",
                                  method),
    GNUNET_PQ_result_spec_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "truth_select",
                                                   params,
                                                   rs);
}


/**
 * Lookup (encrypted) key share by @a truth_uuid.
 *
 * @param cls closure
 * @param truth_uuid the identifier for the Truth
 * @param[out] key_share contains the encrypted Keyshare
 * @return transaction status
 */
enum GNUNET_DB_QueryStatus
postgres_get_key_share (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  struct ANASTASIS_CRYPTO_EncryptedKeyShareP *key_share)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_auto_from_type ("key_share_data",
                                          key_share),
    GNUNET_PQ_result_spec_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "key_share_select",
                                                   params,
                                                   rs);
}


/**
 * Check if an account exists, and if so, return the
 * current @a recovery_document_hash.
 *
 * @param cls closure
 * @param account_pub account identifier
 * @param[out] paid_until until when is the account paid up?
 * @param[out] recovery_data_hash set to hash of @a recovery document
 * @param[out] version set to the recovery policy version
 * @return transaction status
 */
enum ANASTASIS_DB_AccountStatus
postgres_lookup_account (
  void *cls,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  struct GNUNET_TIME_Absolute *paid_until,
  struct GNUNET_HashCode *recovery_data_hash,
  uint32_t *version)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (account_pub),
    GNUNET_PQ_query_param_end
  };
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  GNUNET_break (GNUNET_OK ==
                postgres_preflight (pg));
  {
    struct GNUNET_PQ_ResultSpec rs[] = {
      GNUNET_PQ_result_spec_absolute_time ("expiration_date",
                                           paid_until),
      GNUNET_PQ_result_spec_auto_from_type ("recovery_data_hash",
                                            recovery_data_hash),
      GNUNET_PQ_result_spec_uint32 ("version",
                                    version),
      GNUNET_PQ_result_spec_end
    };

    qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "latest_recovery_version_select",
                                                   params,
                                                   rs);
  }
  switch (qs)
  {
  case GNUNET_DB_STATUS_HARD_ERROR:
    return ANASTASIS_DB_ACCOUNT_STATUS_HARD_ERROR;
  case GNUNET_DB_STATUS_SOFT_ERROR:
    GNUNET_break (0);
    return ANASTASIS_DB_ACCOUNT_STATUS_HARD_ERROR;
  case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
    break; /* handle interesting case below */
  case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
    return ANASTASIS_DB_ACCOUNT_STATUS_VALID_HASH_RETURNED;
  }

  /* check if account exists */
  {
    struct GNUNET_PQ_ResultSpec rs[] = {
      GNUNET_PQ_result_spec_absolute_time ("expiration_date",
                                           paid_until),
      GNUNET_PQ_result_spec_end
    };

    qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "user_select",
                                                   params,
                                                   rs);
  }
  switch (qs)
  {
  case GNUNET_DB_STATUS_HARD_ERROR:
    return ANASTASIS_DB_ACCOUNT_STATUS_HARD_ERROR;
  case GNUNET_DB_STATUS_SOFT_ERROR:
    GNUNET_break (0);
    return ANASTASIS_DB_ACCOUNT_STATUS_HARD_ERROR;
  case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
    /* indicates: no account */
    return ANASTASIS_DB_ACCOUNT_STATUS_PAYMENT_REQUIRED;
  case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
    /* indicates: no backup */
    *version = UINT32_MAX;
    memset (recovery_data_hash,
            0,
            sizeof (*recovery_data_hash));
    return ANASTASIS_DB_ACCOUNT_STATUS_NO_RESULTS;
  default:
    GNUNET_break (0);
    return ANASTASIS_DB_ACCOUNT_STATUS_HARD_ERROR;
  }
}


/**
 * Fetch latest recovery document for user.
 *
 * @param cls closure
 * @param account_pub public key of the user's account
 * @param account_sig signature
 * @param recovery_data_hash hash of the current recovery data
 * @param data_size size of data blob
 * @param data blob which contains the recovery document
 * @param[out] version set to the version number of the policy being returned
 * @return transaction status
 */
enum GNUNET_DB_QueryStatus
postgres_get_latest_recovery_document (
  void *cls,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  struct ANASTASIS_AccountSignatureP *account_sig,
  struct GNUNET_HashCode *recovery_data_hash,
  size_t *data_size,
  void **data,
  uint32_t *version)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (account_pub),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_uint32 ("version",
                                  version),
    GNUNET_PQ_result_spec_auto_from_type ("account_sig",
                                          account_sig),
    GNUNET_PQ_result_spec_auto_from_type ("recovery_data_hash",
                                          recovery_data_hash),
    GNUNET_PQ_result_spec_variable_size ("recovery_data",
                                         data,
                                         data_size),
    GNUNET_PQ_result_spec_end
  };

  check_connection (pg);
  GNUNET_break (GNUNET_OK ==
                postgres_preflight (pg));
  return GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "latest_recoverydocument_select",
                                                   params,
                                                   rs);
}


/**
 * Fetch recovery document for user according given version.
 *
 * @param cls closure
 * @param account_pub public key of the user's account
 * @param version the version number of the policy the user requests
 * @param[out] account_sig signature
 * @param[out] recovery_data_hash hash of the current recovery data
 * @param[out] data_size size of data blob
 * @param[out] data blob which contains the recovery document
 * @return transaction status
 */
enum GNUNET_DB_QueryStatus
postgres_get_recovery_document (
  void *cls,
  const struct ANASTASIS_CRYPTO_AccountPublicKeyP *account_pub,
  uint32_t version,
  struct ANASTASIS_AccountSignatureP *account_sig,
  struct GNUNET_HashCode *recovery_data_hash,
  size_t *data_size,
  void **data)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (account_pub),
    GNUNET_PQ_query_param_uint32 (&version),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_auto_from_type ("account_sig",
                                          account_sig),
    GNUNET_PQ_result_spec_auto_from_type ("recovery_data_hash",
                                          recovery_data_hash),
    GNUNET_PQ_result_spec_variable_size ("recovery_data",
                                         data,
                                         data_size),
    GNUNET_PQ_result_spec_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "recoverydocument_select",
                                                   params,
                                                   rs);
}


/**
 * Closure for check_valid_code().
 */
struct CheckValidityContext
{
  /**
   * Code to check for.
   */
  const struct GNUNET_HashCode *hashed_code;

  /**
   * Truth we are processing.
   */
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid;

  /**
   * Database context.
   */
  struct PostgresClosure *pg;

  /**
   * Set to the matching challenge code (if @e valid).
   */
  uint64_t code;

  /**
   * Set to true if a code matching @e hashed_code was found.
   */
  bool valid;

  /**
   * Set to true if a code matching @e hashed_code was set to 'satisfied' by the plugin.
   */
  bool satisfied;

  /**
   * Set to true if we had a database failure.
   */
  bool db_failure;

};


/**
 * Helper function for #postgres_verify_challenge_code().
 * To be called with the results of a SELECT statement
 * that has returned @a num_results results.
 *
 * @param cls closure of type `struct CheckValidityContext *`
 * @param result the postgres result
 * @param num_results the number of results in @a result
 */
static void
check_valid_code (void *cls,
                  PGresult *result,
                  unsigned int num_results)
{
  struct CheckValidityContext *cvc = cls;
  struct PostgresClosure *pg = cvc->pg;

  for (unsigned int i = 0; i < num_results; i++)
  {
    uint64_t server_code;
    uint8_t sat;
    struct GNUNET_PQ_ResultSpec rs[] = {
      GNUNET_PQ_result_spec_uint64 ("code",
                                    &server_code),
      GNUNET_PQ_result_spec_auto_from_type ("satisfied",
                                            &sat),
      GNUNET_PQ_result_spec_end
    };

    if (GNUNET_OK !=
        GNUNET_PQ_extract_result (result,
                                  rs,
                                  i))
    {
      GNUNET_break (0);
      cvc->db_failure = true;
      return;
    }
    {
      struct GNUNET_HashCode shashed_code;

      ANASTASIS_hash_answer (server_code,
                             &shashed_code);
      if (0 ==
          GNUNET_memcmp (&shashed_code,
                         cvc->hashed_code))
      {
        cvc->valid = true;
        cvc->code = server_code;
        cvc->satisfied = (0 != sat);
      }
      else
      {
        /* count failures to prevent brute-force attacks */
        struct GNUNET_PQ_QueryParam params[] = {
          GNUNET_PQ_query_param_auto_from_type (cvc->truth_uuid),
          GNUNET_PQ_query_param_uint64 (&server_code),
          GNUNET_PQ_query_param_end
        };
        enum GNUNET_DB_QueryStatus qs;

        qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                                 "challengecode_update_retry",
                                                 params);
        if (qs <= 0)
        {
          GNUNET_break (0);
          cvc->db_failure = true;
        }
      }
    }
  }
}


/**
 * Verify the provided code with the code on the server.
 * If the code matches the function will return with success, if the code
 * does not match, the retry counter will be decreased by one.
 *
 * @param cls closure
 * @param truth_uuid identification of the challenge which the code corresponds to
 * @param hashed_code code which the user provided and wants to verify
 * @param[out] code set to the original numeric code
 * @param[out] satisfied set to true if the challenge is set to satisfied
 * @return code validity status
 */
enum ANASTASIS_DB_CodeStatus
postgres_verify_challenge_code (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const struct GNUNET_HashCode *hashed_code,
  uint64_t *code,
  bool *satisfied)
{
  struct PostgresClosure *pg = cls;
  struct CheckValidityContext cvc = {
    .truth_uuid = truth_uuid,
    .hashed_code = hashed_code,
    .pg = pg
  };
  struct GNUNET_TIME_Absolute now = GNUNET_TIME_absolute_get ();
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    TALER_PQ_query_param_absolute_time (&now),
    GNUNET_PQ_query_param_end
  };
  enum GNUNET_DB_QueryStatus qs;

  *satisfied = false;
  check_connection (pg);
  GNUNET_TIME_round_abs (&now);
  qs = GNUNET_PQ_eval_prepared_multi_select (pg->conn,
                                             "challengecode_select",
                                             params,
                                             &check_valid_code,
                                             &cvc);
  if ( (qs < 0) ||
       (cvc.db_failure) )
    return ANASTASIS_DB_CODE_STATUS_HARD_ERROR;
  *code = cvc.code;
  if (cvc.valid)
  {
    *satisfied = cvc.satisfied;
    return ANASTASIS_DB_CODE_STATUS_VALID_CODE_STORED;
  }
  if (0 == qs)
    return ANASTASIS_DB_CODE_STATUS_NO_RESULTS;
  return ANASTASIS_DB_CODE_STATUS_CHALLENGE_CODE_MISMATCH;
}


/**
 * Set the 'satisfied' bit for the given challenge and code to
 * 'true'.
 *
 * @param cls closure
 * @param truth_uuid identification of the challenge which the code corresponds to
 * @param code code which is now satisfied
 * @return transaction status
 */
static enum GNUNET_DB_QueryStatus
postgres_mark_challenge_code_satisfied (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const uint64_t code)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_uint64 (&code),
    GNUNET_PQ_query_param_end
  };

  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "challengecode_set_satisfied",
                                             params);
}


/**
 * Check if the 'satisfied' bit for the given challenge and code is
 * 'true' and the challenge code is not yet expired.
 *
 * @param cls closure
 * @param truth_uuid identification of the challenge which the code corresponds to
 * @param code code which is now satisfied
 * @return transaction status,
 *        #GNUNET_DB_STATUS_SUCCESS_NO_RESULTS if the challenge code is not satisfied or expired
 *        #GNUNET_DB_STATUS_SUCCESS_ONE_RESULT if the challenge code has been marked as satisfied
 */
static enum GNUNET_DB_QueryStatus
postgres_test_challenge_code_satisfied (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const uint64_t code,
  struct GNUNET_TIME_Absolute after)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_uint64 (&code),
    GNUNET_PQ_query_param_absolute_time (&after),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_end
  };

  return GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "challengecode_test_satisfied",
                                                   params,
                                                   rs);
}


/**
 * Lookup pending payment for a certain challenge.
 *
 * @param cls closure
 * @param truth_uuid identification of the challenge
 * @param[out] payment_secret set to the challenge payment secret
 * @return transaction status
 */
enum GNUNET_DB_QueryStatus
postgres_lookup_challenge_payment (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  struct ANASTASIS_PaymentSecretP *payment_secret)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_TIME_Absolute now = GNUNET_TIME_absolute_get ();
  struct GNUNET_TIME_Absolute recent
    = GNUNET_TIME_absolute_subtract (now,
                                     ANASTASIS_CHALLENGE_OFFER_LIFETIME);
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_absolute_time (&recent),
    GNUNET_PQ_query_param_end
  };
  struct GNUNET_PQ_ResultSpec rs[] = {
    GNUNET_PQ_result_spec_auto_from_type ("payment_identifier",
                                          payment_secret),
    GNUNET_PQ_result_spec_end
  };

  return GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                   "challenge_pending_payment_select",
                                                   params,
                                                   rs);
}


/**
 * Update payment status of challenge
 *
 * @param cls closure
 * @param truth_uuid which challenge received a payment
 * @param payment_identifier proof of payment, must be unique and match pending payment
 * @return transaction status
 */
enum GNUNET_DB_QueryStatus
postgres_update_challenge_payment (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  const struct ANASTASIS_PaymentSecretP *payment_identifier)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_auto_from_type (payment_identifier),
    GNUNET_PQ_query_param_auto_from_type (truth_uuid),
    GNUNET_PQ_query_param_end
  };

  check_connection (pg);
  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "challenge_payment_done",
                                             params);
}


/**
 * Create a new challenge code for a given challenge identified by the challenge
 * public key. The function will first check if there is already a valid code
 * for this challenge present and won't insert a new one in this case.
 *
 * @param cls closure
 * @param truth_uuid the identifier for the challenge
 * @param rotation_period for how long is the code available
 * @param validity_period for how long is the code available
 * @param retry_counter amount of retries allowed
 * @param[out] retransmission_date when to next retransmit
 * @param[out] code set to the code which will be checked for later
 * @return transaction status,
 *        #GNUNET_DB_STATUS_SUCCESS_NO_RESULTS if we are out of valid tries,
 *        #GNUNET_DB_STATUS_SUCCESS_ONE_RESULT if @a code is now in the DB
 */
enum GNUNET_DB_QueryStatus
postgres_create_challenge_code (
  void *cls,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  struct GNUNET_TIME_Relative rotation_period,
  struct GNUNET_TIME_Relative validity_period,
  uint32_t retry_counter,
  struct GNUNET_TIME_Absolute *retransmission_date,
  uint64_t *code)
{
  struct PostgresClosure *pg = cls;
  enum GNUNET_DB_QueryStatus qs;
  struct GNUNET_TIME_Absolute now = GNUNET_TIME_absolute_get ();
  struct GNUNET_TIME_Absolute expiration_date;
  struct GNUNET_TIME_Absolute ex_rot;

  check_connection (pg);
  GNUNET_TIME_round_abs (&now);
  expiration_date = GNUNET_TIME_absolute_add (now,
                                              validity_period);
  ex_rot = GNUNET_TIME_absolute_subtract (now,
                                          rotation_period);
  for (unsigned int retries = 0; retries<MAX_RETRIES; retries++)
  {
    if (GNUNET_OK !=
        begin_transaction (pg,
                           "create_challenge_code"))
    {
      GNUNET_break (0);
      return GNUNET_DB_STATUS_HARD_ERROR;
    }

    {
      uint32_t old_retry_counter;
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (truth_uuid),
        TALER_PQ_query_param_absolute_time (&now),
        TALER_PQ_query_param_absolute_time (&ex_rot),
        GNUNET_PQ_query_param_end
      };
      struct GNUNET_PQ_ResultSpec rs[] = {
        GNUNET_PQ_result_spec_uint64 ("code",
                                      code),
        GNUNET_PQ_result_spec_uint32 ("retry_counter",
                                      &old_retry_counter),
        GNUNET_PQ_result_spec_absolute_time ("retransmission_date",
                                             retransmission_date),
        GNUNET_PQ_result_spec_end
      };
      enum GNUNET_DB_QueryStatus qs;

      qs = GNUNET_PQ_eval_prepared_singleton_select (pg->conn,
                                                     "challengecode_select_meta",
                                                     params,
                                                     rs);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        GNUNET_break (0);
        rollback (pg);
        return qs;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        goto retry;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "No active challenge found, creating a fresh one\n");
        break;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        if (0 == old_retry_counter)
        {
          rollback (pg);
          GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                      "Active challenge %llu has zero tries left, refusing to create another one\n",
                      (unsigned long long) code);
          return GNUNET_DB_STATUS_SUCCESS_NO_RESULTS;
        }
        rollback (pg);
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Active challenge has %u tries left, returning old challenge\n",
                    (unsigned int) old_retry_counter);
        return qs;
      }
    }

    *code = GNUNET_CRYPTO_random_u64 (GNUNET_CRYPTO_QUALITY_NONCE,
                                      NONCE_MAX_VALUE);
    *retransmission_date = GNUNET_TIME_UNIT_ZERO_ABS;
    {
      struct GNUNET_PQ_QueryParam params[] = {
        GNUNET_PQ_query_param_auto_from_type (truth_uuid),
        GNUNET_PQ_query_param_uint64 (code),
        TALER_PQ_query_param_absolute_time (&now),
        TALER_PQ_query_param_absolute_time (&expiration_date),
        GNUNET_PQ_query_param_uint32 (&retry_counter),
        GNUNET_PQ_query_param_end
      };

      qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                               "challengecode_insert",
                                               params);
      switch (qs)
      {
      case GNUNET_DB_STATUS_HARD_ERROR:
        rollback (pg);
        return GNUNET_DB_STATUS_HARD_ERROR;
      case GNUNET_DB_STATUS_SOFT_ERROR:
        goto retry;
      case GNUNET_DB_STATUS_SUCCESS_NO_RESULTS:
        GNUNET_break (0);
        rollback (pg);
        return GNUNET_DB_STATUS_HARD_ERROR;
      case GNUNET_DB_STATUS_SUCCESS_ONE_RESULT:
        GNUNET_log (GNUNET_ERROR_TYPE_INFO,
                    "Created fresh challenge with %u tries left\n",
                    (unsigned int) retry_counter);
        break;
      }
    }
    qs = commit_transaction (pg);
    if (GNUNET_DB_STATUS_SOFT_ERROR == qs)
      goto retry;
    if (qs < 0)
      return qs;
    return GNUNET_DB_STATUS_SUCCESS_ONE_RESULT;
retry:
    rollback (pg);
  }
  return GNUNET_DB_STATUS_SOFT_ERROR;
}


/**
 * Remember in the database that we successfully sent a challenge.
 *
 * @param cls closure
 * @param payment_secret payment secret which the user must provide with every upload
 * @param truth_uuid the identifier for the challenge
 * @param code the challenge that was sent
 */
static enum GNUNET_DB_QueryStatus
postgres_mark_challenge_sent (
  void *cls,
  const struct ANASTASIS_PaymentSecretP *payment_secret,
  const struct ANASTASIS_CRYPTO_TruthUUIDP *truth_uuid,
  uint64_t code)
{
  struct PostgresClosure *pg = cls;
  enum GNUNET_DB_QueryStatus qs;

  check_connection (pg);
  {
    struct GNUNET_TIME_Absolute now;
    struct GNUNET_PQ_QueryParam params[] = {
      GNUNET_PQ_query_param_auto_from_type (truth_uuid),
      GNUNET_PQ_query_param_uint64 (&code),
      TALER_PQ_query_param_absolute_time (&now),
      GNUNET_PQ_query_param_end
    };

    now = GNUNET_TIME_absolute_get ();
    GNUNET_TIME_round_abs (&now);
    qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "challengecode_mark_sent",
                                             params);
    if (qs <= 0)
      return qs;
  }
  {
    struct GNUNET_PQ_QueryParam params[] = {
      GNUNET_PQ_query_param_auto_from_type (truth_uuid),
      GNUNET_PQ_query_param_auto_from_type (payment_secret),
      GNUNET_PQ_query_param_end
    };

    qs = GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "challengepayment_dec_counter",
                                             params);
    if (GNUNET_DB_STATUS_SUCCESS_NO_RESULTS == qs)
      return GNUNET_DB_STATUS_SUCCESS_ONE_RESULT; /* probably was free */
    return qs;
  }
}


/**
 * Function called to remove all expired codes from the database.
 *
 * @return transaction status
 */
enum GNUNET_DB_QueryStatus
postgres_challenge_gc (void *cls)
{
  struct PostgresClosure *pg = cls;
  struct GNUNET_TIME_Absolute time_now = GNUNET_TIME_absolute_get ();
  struct GNUNET_PQ_QueryParam params[] = {
    GNUNET_PQ_query_param_absolute_time (&time_now),
    GNUNET_PQ_query_param_end
  };

  check_connection (pg);
  GNUNET_break (GNUNET_OK ==
                postgres_preflight (pg));
  return GNUNET_PQ_eval_prepared_non_select (pg->conn,
                                             "gc_challengecodes",
                                             params);
}


/**
 * Initialize Postgres database subsystem.
 *
 * @param cls a configuration instance
 * @return NULL on error, otherwise a `struct TALER_ANASTASISDB_Plugin`
 */
void *
libanastasis_plugin_db_postgres_init (void *cls)
{
  struct GNUNET_CONFIGURATION_Handle *cfg = cls;
  struct PostgresClosure *pg;
  struct ANASTASIS_DatabasePlugin *plugin;

  pg = GNUNET_new (struct PostgresClosure);
  pg->cfg = cfg;
  if (GNUNET_OK !=
      GNUNET_CONFIGURATION_get_value_string (cfg,
                                             "taler",
                                             "CURRENCY",
                                             &pg->currency))
  {
    GNUNET_log_config_missing (GNUNET_ERROR_TYPE_ERROR,
                               "taler",
                               "CURRENCY");
    GNUNET_PQ_disconnect (pg->conn);
    GNUNET_free (pg);
    return NULL;
  }
  plugin = GNUNET_new (struct ANASTASIS_DatabasePlugin);
  plugin->cls = pg;
  /* FIXME: Should this be the same? */
  plugin->connect = &postgres_preflight;
  plugin->create_tables = &postgres_create_tables;
  plugin->drop_tables = &postgres_drop_tables;
  plugin->gc = &postgres_gc;
  plugin->preflight = &postgres_preflight;
  plugin->rollback = &rollback;
  plugin->commit = &commit_transaction;
  plugin->event_listen = &postgres_event_listen;
  plugin->event_listen_cancel = &postgres_event_listen_cancel;
  plugin->event_notify = &postgres_event_notify;
  plugin->store_recovery_document = &postgres_store_recovery_document;
  plugin->record_recdoc_payment = &postgres_record_recdoc_payment;
  plugin->store_truth = &postgres_store_truth;
  plugin->get_escrow_challenge = &postgres_get_escrow_challenge;
  plugin->get_key_share = &postgres_get_key_share;
  plugin->get_latest_recovery_document = &postgres_get_latest_recovery_document;
  plugin->get_recovery_document = &postgres_get_recovery_document;
  plugin->lookup_account = &postgres_lookup_account;
  plugin->check_payment_identifier = &postgres_check_payment_identifier;
  plugin->increment_lifetime = &postgres_increment_lifetime;
  plugin->update_lifetime = &postgres_update_lifetime;
  plugin->start = &begin_transaction;
  plugin->check_connection = &check_connection;
  plugin->verify_challenge_code = &postgres_verify_challenge_code;
  plugin->mark_challenge_code_satisfied =
    &postgres_mark_challenge_code_satisfied;
  plugin->test_challenge_code_satisfied =
    &postgres_test_challenge_code_satisfied;
  plugin->create_challenge_code = &postgres_create_challenge_code;
  plugin->mark_challenge_sent = &postgres_mark_challenge_sent;
  plugin->challenge_gc = &postgres_challenge_gc;
  plugin->record_truth_upload_payment = &postgres_record_truth_upload_payment;
  plugin->check_truth_upload_paid = &postgres_check_truth_upload_paid;
  plugin->record_challenge_payment = &postgres_record_challenge_payment;
  plugin->record_challenge_refund = &postgres_record_challenge_refund;
  plugin->check_challenge_payment = &postgres_check_challenge_payment;
  plugin->lookup_challenge_payment = &postgres_lookup_challenge_payment;
  plugin->update_challenge_payment = &postgres_update_challenge_payment;
  plugin->record_auth_iban_payment = &postgres_record_auth_iban_payment;
  plugin->test_auth_iban_payment = &postgres_test_auth_iban_payment;
  plugin->get_last_auth_iban_payment_row
    = &postgres_get_last_auth_iban_payment_row;
  return plugin;
}


/**
 * Shutdown Postgres database subsystem.
 *
 * @param cls a `struct ANASTASIS_DB_STATUS_Plugin`
 * @return NULL (always)
 */
void *
libanastasis_plugin_db_postgres_done (void *cls)
{
  struct ANASTASIS_DatabasePlugin *plugin = cls;
  struct PostgresClosure *pg = plugin->cls;

  GNUNET_PQ_disconnect (pg->conn);
  GNUNET_free (pg->currency);
  GNUNET_free (pg);
  GNUNET_free (plugin);
  return NULL;
}


/* end of plugin_anastasisdb_postgres.c */
