--
-- This file is part of Anastasis
-- Copyright (C) 2020, 2021 Anastasis SARL SA
--
-- ANASTASIS is free software; you can redistribute it and/or modify it under the
-- terms of the GNU General Public License as published by the Free Software
-- Foundation; either version 3, or (at your option) any later version.
--
-- ANASTASIS is distributed in the hope that it will be useful, but WITHOUT ANY
-- WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
-- A PARTICULAR PURPOSE.  See the GNU General Public License for more details.
--
-- You should have received a copy of the GNU General Public License along with
-- ANASTASIS; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
--

-- Everything in one big transaction
BEGIN;

-- Check patch versioning is in place.
SELECT _v.register_patch('stasis-0001', NULL, NULL);


CREATE TABLE IF NOT EXISTS anastasis_truth_payment
  (truth_uuid BYTEA PRIMARY KEY CHECK(LENGTH(truth_uuid)=32),
   amount_val INT8 NOT NULL,
   amount_frac INT4 NOT NULL,
   expiration INT8 NOT NULL);
COMMENT ON TABLE anastasis_truth_payment
  IS 'Records about payments for truth uploads';
COMMENT ON COLUMN anastasis_truth_payment.truth_uuid
  IS 'Identifier of the truth';
COMMENT ON COLUMN anastasis_truth_payment.amount_val
  IS 'Amount we were paid';
COMMENT ON COLUMN anastasis_truth_payment.amount_frac
  IS 'Amount we were paid fraction';
COMMENT ON COLUMN anastasis_truth_payment.expiration
  IS 'At which date will the truth payment expire';


CREATE TABLE IF NOT EXISTS anastasis_truth
  (truth_uuid BYTEA PRIMARY KEY CHECK(LENGTH(truth_uuid)=32),
   key_share_data BYTEA CHECK(LENGTH(key_share_data)=80) NOT NULL,
   method_name VARCHAR NOT NULL,
   encrypted_truth BYTEA NOT NULL,
   truth_mime VARCHAR NOT NULL,
   expiration INT8 NOT NULL);
COMMENT ON TABLE anastasis_truth
  IS 'Truth data is needed to authenticate clients during recovery';
COMMENT ON COLUMN anastasis_truth.truth_uuid
  IS 'The truth UUID uniquely identifies this truth record. Not a foreign key as we may offer storing truth for free.';
COMMENT ON COLUMN anastasis_truth.key_share_data
  IS 'Stores the encrypted key share used to recover the key (nonce, tag and keyshare)';
COMMENT ON COLUMN anastasis_truth.method_name
  IS 'Defines the authentication method (SMS, E-Mail, Question..)';
COMMENT ON COLUMN anastasis_truth.encrypted_truth
  IS 'Stores the encrypted authentication data';
COMMENT ON COLUMN anastasis_truth.truth_mime
  IS 'Defines the mime type of the stored authentcation data';
COMMENT ON COLUMN anastasis_truth.expiration
  IS 'At which date will the truth record expire';


CREATE TABLE IF NOT EXISTS anastasis_user
  (user_id BYTEA PRIMARY KEY CHECK(LENGTH(user_id)=32),
   expiration_date INT8 NOT NULL);
COMMENT ON TABLE anastasis_user
  IS 'Saves a user which is using Anastasis';
COMMENT ON COLUMN anastasis_user.user_id
  IS 'Identifier of the user account';
COMMENT ON COLUMN anastasis_user.expiration_date
  IS 'At which date will the user record expire';


CREATE TABLE IF NOT EXISTS anastasis_recdoc_payment
  (payment_id BIGSERIAL PRIMARY KEY,
   user_id BYTEA NOT NULL REFERENCES anastasis_user(user_id),
   post_counter INT4 NOT NULL DEFAULT 0 CHECK(post_counter >= 0),
   amount_val INT8 NOT NULL,
   amount_frac INT4 NOT NULL,
   payment_identifier BYTEA NOT NULL CHECK(LENGTH(payment_identifier)=32),
   creation_date INT8 NOT NULL,
   paid BOOLEAN NOT NULL DEFAULT FALSE);
COMMENT ON TABLE anastasis_recdoc_payment
  IS 'Records a payment for a recovery document';
COMMENT ON COLUMN anastasis_recdoc_payment.payment_id
  IS 'Serial number which identifies the payment';
COMMENT ON COLUMN anastasis_recdoc_payment.user_id
  IS 'Link to the corresponding user who paid';
COMMENT ON COLUMN anastasis_recdoc_payment.post_counter
  IS 'For how many posts does the user pay';
COMMENT ON COLUMN anastasis_recdoc_payment.amount_val
  IS 'Amount we were paid';
COMMENT ON COLUMN anastasis_recdoc_payment.amount_frac
  IS 'Amount we were paid fraction';
COMMENT ON COLUMN anastasis_recdoc_payment.payment_identifier
  IS 'Payment identifier which the user has to provide';
COMMENT ON COLUMN anastasis_recdoc_payment.creation_date
  IS 'Creation date of the payment';
COMMENT ON COLUMN anastasis_recdoc_payment.paid
  IS 'Is the payment finished';


CREATE TABLE IF NOT EXISTS anastasis_challenge_payment
  (payment_id BIGSERIAL PRIMARY KEY,
   truth_uuid BYTEA CHECK(LENGTH(truth_uuid)=32) NOT NULL,
   amount_val INT8 NOT NULL,
   amount_frac INT4 NOT NULL,
   payment_identifier BYTEA NOT NULL CHECK(LENGTH(payment_identifier)=32),
   creation_date INT8 NOT NULL,
   counter INT4 NOT NULL DEFAULT 3,
   paid BOOLEAN NOT NULL DEFAULT FALSE,
   refunded BOOLEAN NOT NULL DEFAULT FALSE
  );
COMMENT ON TABLE anastasis_recdoc_payment
  IS 'Records a payment for a challenge';
COMMENT ON COLUMN anastasis_challenge_payment.payment_id
  IS 'Serial number which identifies the payment';
COMMENT ON COLUMN anastasis_challenge_payment.truth_uuid
  IS 'Link to the corresponding challenge which is paid';
COMMENT ON COLUMN anastasis_challenge_payment.amount_val
  IS 'Amount we were paid';
COMMENT ON COLUMN anastasis_challenge_payment.amount_frac
  IS 'Amount we were paid fraction';
COMMENT ON COLUMN anastasis_challenge_payment.payment_identifier
  IS 'Payment identifier which the user has to provide';
COMMENT ON COLUMN anastasis_challenge_payment.counter
  IS 'How many more times will we issue the challenge for the given payment';
COMMENT ON COLUMN anastasis_challenge_payment.creation_date
  IS 'Creation date of the payment';
COMMENT ON COLUMN anastasis_challenge_payment.paid
  IS 'Is the payment finished';
COMMENT ON COLUMN anastasis_challenge_payment.refunded
  IS 'Was the payment refunded';


CREATE TABLE IF NOT EXISTS anastasis_recoverydocument
  (user_id BYTEA NOT NULL REFERENCES anastasis_user(user_id),
   version INT4 NOT NULL,
   account_sig BYTEA NOT NULL CHECK(LENGTH(account_sig)=64),
   recovery_data_hash BYTEA NOT NULL CHECK(length(recovery_data_hash)=64),
   recovery_data BYTEA NOT NULL,
   PRIMARY KEY (user_id, version));
COMMENT ON TABLE anastasis_recoverydocument
  IS 'Stores a recovery document which contains the policy and the encrypted core secret';
COMMENT ON COLUMN anastasis_recoverydocument.user_id
  IS 'Link to the owner of this recovery document';
COMMENT ON COLUMN anastasis_recoverydocument.version
  IS 'The version of this recovery document';
COMMENT ON COLUMN anastasis_recoverydocument.account_sig
  IS 'Signature of the recovery document';
COMMENT ON COLUMN anastasis_recoverydocument.recovery_data_hash
  IS 'Hash of the recovery document to prevent unnecessary uploads';
COMMENT ON COLUMN anastasis_recoverydocument.recovery_data
  IS 'Contains the encrypted policy and core secret';


CREATE TABLE IF NOT EXISTS anastasis_challengecode
  (truth_uuid BYTEA CHECK(LENGTH(truth_uuid)=32) NOT NULL,
   code INT8 NOT NULL,
   creation_date INT8 NOT NULL,
   expiration_date INT8 NOT NULL,
   retransmission_date INT8 NOT NULL DEFAULT 0,
   retry_counter INT4 NOT NULL,
   satisfied BOOLEAN NOT NULL DEFAULT FALSE);
COMMENT ON TABLE anastasis_challengecode
  IS 'Stores a code which is checked for the authentication by SMS, E-Mail..';
COMMENT ON COLUMN anastasis_challengecode.truth_uuid
  IS 'Link to the corresponding challenge which is solved';
COMMENT ON COLUMN anastasis_challengecode.code
  IS 'The pin code which is sent to the user and verified';
COMMENT ON COLUMN anastasis_challengecode.creation_date
  IS 'Creation date of the code';
COMMENT ON COLUMN anastasis_challengecode.retransmission_date
  IS 'When did we last transmit the challenge to the user';
COMMENT ON COLUMN anastasis_challengecode.expiration_date
  IS 'When will the code expire';
COMMENT ON COLUMN anastasis_challengecode.retry_counter
  IS 'How many tries are left for this code must be > 0';
COMMENT ON COLUMN anastasis_challengecode.satisfied
  IS 'Has this challenge been satisfied by the user, used if it is not enough for the user to know the code (like for video identification or SEPA authentication). For SMS/E-mail/Post verification, this field being FALSE does not imply that the user did not meet the challenge.';

CREATE INDEX IF NOT EXISTS anastasis_challengecode_uuid_index
  ON anastasis_challengecode
  (truth_uuid,expiration_date);
COMMENT ON INDEX anastasis_challengecode_uuid_index
  IS 'for challenge lookup';

CREATE INDEX IF NOT EXISTS anastasis_challengecode_expiration_index
  ON anastasis_challengecode
  (truth_uuid,expiration_date);
COMMENT ON INDEX anastasis_challengecode_expiration_index
  IS 'for challenge garbage collection';


CREATE TABLE IF NOT EXISTS anastasis_auth_iban_in
  (auth_in_serial_id BIGSERIAL UNIQUE
  ,wire_reference INT8 NOT NULL PRIMARY KEY
  ,wire_subject TEXT NOT NULL
  ,credit_val INT8 NOT NULL
  ,credit_frac INT4 NOT NULL
  ,debit_account_details TEXT NOT NULL
  ,credit_account_details TEXT NOT NULL
  ,execution_date INT8 NOT NULL
  );
COMMENT ON TABLE anastasis_auth_iban_in
  IS 'list of IBAN wire transfers for authentication using the IBAN plugin';
COMMENT ON COLUMN anastasis_auth_iban_in.wire_reference
  IS 'Unique number identifying the wire transfer in LibEuFin/Nexus';
COMMENT ON COLUMN anastasis_auth_iban_in.wire_subject
  IS 'For authentication, this contains the code, but also additional text';
COMMENT ON COLUMN anastasis_auth_iban_in.execution_date
  IS 'Used both for (theoretical) garbage collection and to see if the transfer happened on time';
COMMENT ON COLUMN anastasis_auth_iban_in.credit_account_details
  IS 'Identifies the bank account of the Anastasis provider, which could change over time';
COMMENT ON COLUMN anastasis_auth_iban_in.debit_account_details
  IS 'Identifies the bank account of the customer, which must match what was given in the truth';

CREATE INDEX IF NOT EXISTS anastasis_auth_iban_in_lookup_index
  ON anastasis_auth_iban_in
  (debit_account_details
  ,execution_date
  );

-- Complete transaction
COMMIT;
