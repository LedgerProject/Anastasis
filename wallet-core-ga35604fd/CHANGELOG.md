# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

* The repository is now structured as a collection of packages (= "monorepo") managed by pnpm.
* The wallet now uses error codes from the GANA registry consistently and has improved error reporting.

### Added

* Added the taler-integrationtests package with a test harness and fault injection support,
as well as many test cases that use this infrastructure.
* The wallet core has a single documented JSON API that is used by all UIs / clients
instead of multiple different APIs.
* The wallet WebExtension can now run with significantly reduced permissions.

### Deprecated

* The "pending transactions" and "history" concepts and corresponding APIs have
been deprecated and partially removed.  They are replaced by the new "pending
operations" concept / API.

### Removed

* The "return funds to bank account" feature has been temporarily removed,
and will be added after a redesign that properly accounts for the requirements.
