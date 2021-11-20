/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 *
 * @author Sebastian Javier Marchano (sebasjm)
 */

import { amountFractionalBase } from "@gnu-taler/taler-util";
import { createExample } from "../test-utils";
import { View as TestedComponent } from "./Withdraw";

export default {
  title: "cta/withdraw",
  component: TestedComponent,
  argTypes: {
    onSwitchExchange: { action: "onRetry" },
  },
};

const termsHtml = `<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>Terms Of Service &#8212; Taler Terms of Service</title>
</head><body>
  <div>
    Terms of service
  </div>
  <div>
    A complete separated html with it's own design
  </div>
</body>
</html>
`;
const termsPlain = `
Terms Of Service
****************

Last Updated: 12.4.2019

Welcome! Taler Systems SA (“we,” “our,” or “us”) provides a payment
service through our Internet presence (collectively the “Services”).
Before using our Services, please read the Terms of Service (the
“Terms” or the “Agreement”) carefully.


Overview
========

This section provides a brief summary of the highlights of this
Agreement. Please note that when you accept this Agreement, you are
accepting all of the terms and conditions and not just this section.
We and possibly other third parties provide Internet services which
interact with the Taler Wallet’s self-hosted personal payment
application. When using the Taler Wallet to interact with our
Services, you are agreeing to our Terms, so please read carefully.


Highlights:
-----------

   * You are responsible for keeping the data in your Taler Wallet at
     all times under your control. Any losses arising from you not
     being in control of your private information are your problem.

   * We will try to transfer funds we hold in escrow for our users to
     any legal recipient to the best of our ability within the
     limitations of the law and our implementation. However, the
     Services offered today are highly experimental and the set of
     recipients of funds is severely restricted.

   * For our Services, we may charge transaction fees. The specific
     fee structure is provided based on the Taler protocol and should
     be shown to you when you withdraw electronic coins using a Taler
     Wallet. You agree and understand that the Taler protocol allows
     for the fee structure to change.

   * You agree to not intentionally overwhelm our systems with
     requests and follow responsible disclosure if you find security
     issues in our services.

   * We cannot be held accountable for our Services not being
     available due to circumstances beyond our control. If we modify
     or terminate our services, we will try to give you the
     opportunity to recover your funds. However, given the
     experimental state of the Services today, this may not be
     possible. You are strongly advised to limit your use of the
     Service to small-scale experiments expecting total loss of all
     funds.

These terms outline approved uses of our Services. The Services and
these Terms are still at an experimental stage. If you have any
questions or comments related to this Agreement, please send us a
message to legal@taler-systems.com. If you do not agree to this
Agreement, you must not use our Services.


How you accept this policy
==========================

By sending funds to us (to top-up your Taler Wallet), you acknowledge
that you have read, understood, and agreed to these Terms. We reserve
the right to change these Terms at any time. If you disagree with the
change, we may in the future offer you with an easy option to recover
your unspent funds. However, in the current experimental period you
acknowledge that this feature is not yet available, resulting in your
funds being lost unless you accept the new Terms. If you continue to
use our Services other than to recover your unspent funds, your
continued use of our Services following any such change will signify
your acceptance to be bound by the then current Terms. Please check
the effective date above to determine if there have been any changes
since you have last reviewed these Terms.


Services
========

We will try to transfer funds that we hold in escrow for our users to
any legal recipient to the best of our ability and within the
limitations of the law and our implementation. However, the Services
offered today are highly experimental and the set of recipients of
funds is severely restricted.  The Taler Wallet can be loaded by
exchanging fiat currencies against electronic coins. We are providing
this exchange service. Once your Taler Wallet is loaded with
electronic coins they can be spent for purchases if the seller is
accepting Taler as a means of payment. We are not guaranteeing that
any seller is accepting Taler at all or a particular seller.  The
seller or recipient of deposits of electronic coins must specify the
target account, as per the design of the Taler protocol. They are
responsible for following the protocol and specifying the correct bank
account, and are solely liable for any losses that may arise from
specifying the wrong account. We will allow the government to link
wire transfers to the underlying contract hash. It is the
responsibility of recipients to preserve the full contracts and to pay
whatever taxes and charges may be applicable. Technical issues may
lead to situations where we are unable to make transfers at all or
lead to incorrect transfers that cannot be reversed. We will only
refuse to execute transfers if the transfers are prohibited by a
competent legal authority and we are ordered to do so.


Fees
====

You agree to pay the fees for exchanges and withdrawals completed via
the Taler Wallet ("Fees") as defined by us, which we may change from
time to time. With the exception of wire transfer fees, Taler
transaction fees are set for any electronic coin at the time of
withdrawal and fixed throughout the validity period of the respective
electronic coin. Your wallet should obtain and display applicable fees
when withdrawing funds. Fees for coins obtained as change may differ
from the fees applicable to the original coin. Wire transfer fees that
are independent from electronic coins may change annually.  You
authorize us to charge or deduct applicable fees owed in connection
with deposits, exchanges and withdrawals following the rules of the
Taler protocol. We reserve the right to provide different types of
rewards to users either in the form of discount for our Services or in
any other form at our discretion and without prior notice to you.


Eligibility
===========

To be eligible to use our Services, you must be able to form legally
binding contracts or have the permission of your legal guardian. By
using our Services, you represent and warrant that you meet all
eligibility requirements that we outline in these Terms.


Financial self-responsibility
=============================

You will be responsible for maintaining the availability, integrity
and confidentiality of the data stored in your wallet. When you setup
a Taler Wallet, you are strongly advised to follow the precautionary
measures offered by the software to minimize the chances to losse
access to or control over your Wallet data. We will not be liable for
any loss or damage arising from your failure to comply with this
paragraph.


Copyrights and trademarks
=========================

The Taler Wallet is released under the terms of the GNU General Public
License (GNU GPL). You have the right to access, use, and share the
Taler Wallet, in modified or unmodified form. However, the GPL is a
strong copyleft license, which means that any derivative works must be
distributed under the same license terms as the original software. If
you have any questions, you should review the GNU GPL’s full terms and
conditions at https://www.gnu.org/licenses/gpl-3.0.en.html.  “Taler”
itself is a trademark of Taler Systems SA. You are welcome to use the
name in relation to processing payments using the Taler protocol,
assuming your use is compatible with an official release from the GNU
Project that is not older than two years.


Your use of our services
========================

When using our Services, you agree to not take any action that
intentionally imposes an unreasonable load on our infrastructure. If
you find security problems in our Services, you agree to first report
them to security@taler-systems.com and grant us the right to publish
your report. We warrant that we will ourselves publicly disclose any
issues reported within 3 months, and that we will not prosecute anyone
reporting security issues if they did not exploit the issue beyond a
proof-of-concept, and followed the above responsible disclosure
practice.


Limitation of liability & disclaimer of warranties
==================================================

You understand and agree that we have no control over, and no duty to
take any action regarding: Failures, disruptions, errors, or delays in
processing that you may experience while using our Services; The risk
of failure of hardware, software, and Internet connections; The risk
of malicious software being introduced or found in the software
underlying the Taler Wallet; The risk that third parties may obtain
unauthorized access to information stored within your Taler Wallet,
including, but not limited to your Taler Wallet coins or backup
encryption keys.  You release us from all liability related to any
losses, damages, or claims arising from:

1. user error such as forgotten passwords, incorrectly constructed
   transactions;

2. server failure or data loss;

3. unauthorized access to the Taler Wallet application;

4. bugs or other errors in the Taler Wallet software; and

5. any unauthorized third party activities, including, but not limited
   to, the use of viruses, phishing, brute forcing, or other means of
   attack against the Taler Wallet. We make no representations
   concerning any Third Party Content contained in or accessed through
   our Services.

Any other terms, conditions, warranties, or representations associated
with such content, are solely between you and such organizations
and/or individuals.


Limitation of liability
=======================

To the fullest extent permitted by applicable law, in no event will we
or any of our officers, directors, representatives, agents, servants,
counsel, employees, consultants, lawyers, and other personnel
authorized to act, acting, or purporting to act on our behalf
(collectively the “Taler Parties”) be liable to you under contract,
tort, strict liability, negligence, or any other legal or equitable
theory, for:

1. any lost profits, data loss, cost of procurement of substitute
   goods or services, or direct, indirect, incidental, special,
   punitive, compensatory, or consequential damages of any kind
   whatsoever resulting from:

   1. your use of, or conduct in connection with, our services;

   2. any unauthorized use of your wallet and/or private key due to
      your failure to maintain the confidentiality of your wallet;

   3. any interruption or cessation of transmission to or from the
      services; or

   4. any bugs, viruses, trojan horses, or the like that are found in
      the Taler Wallet software or that may be transmitted to or
      through our services by any third party (regardless of the
      source of origination), or

2. any direct damages.

These limitations apply regardless of legal theory, whether based on
tort, strict liability, breach of contract, breach of warranty, or any
other legal theory, and whether or not we were advised of the
possibility of such damages. Some jurisdictions do not allow the
exclusion or limitation of liability for consequential or incidental
damages, so the above limitation may not apply to you.


Warranty disclaimer
===================

Our services are provided "as is" and without warranty of any kind. To
the maximum extent permitted by law, we disclaim all representations
and warranties, express or implied, relating to the services and
underlying software or any content on the services, whether provided
or owned by us or by any third party, including without limitation,
warranties of merchantability, fitness for a particular purpose,
title, non-infringement, freedom from computer virus, and any implied
warranties arising from course of dealing, course of performance, or
usage in trade, all of which are expressly disclaimed. In addition, we
do not represent or warrant that the content accessible via the
services is accurate, complete, available, current, free of viruses or
other harmful components, or that the results of using the services
will meet your requirements. Some states do not allow the disclaimer
of implied warranties, so the foregoing disclaimers may not apply to
you. This paragraph gives you specific legal rights and you may also
have other legal rights that vary from state to state.


Indemnity
=========

To the extent permitted by applicable law, you agree to defend,
indemnify, and hold harmless the Taler Parties from and against any
and all claims, damages, obligations, losses, liabilities, costs or
debt, and expenses (including, but not limited to, attorney’s fees)
arising from: (a) your use of and access to the Services; (b) any
feedback or submissions you provide to us concerning the Taler Wallet;
(c) your violation of any term of this Agreement; or (d) your
violation of any law, rule, or regulation, or the rights of any third
party.


Time limitation on claims
=========================

You agree that any claim you may have arising out of or related to
your relationship with us must be filed within one year after such
claim arises, otherwise, your claim in permanently barred.


Governing law
=============

No matter where you’re located, the laws of Switzerland will govern
these Terms. If any provisions of these Terms are inconsistent with
any applicable law, those provisions will be superseded or modified
only to the extent such provisions are inconsistent. The parties agree
to submit to the ordinary courts in Zurich, Switzerland for exclusive
jurisdiction of any dispute arising out of or related to your use of
the Services or your breach of these Terms.


Termination
===========

In the event of termination concerning your use of our Services, your
obligations under this Agreement will still continue.


Discontinuance of services
==========================

We may, in our sole discretion and without cost to you, with or
without prior notice, and at any time, modify or discontinue,
temporarily or permanently, any portion of our Services. We will use
the Taler protocol’s provisions to notify Wallets if our Services are
to be discontinued. It is your responsibility to ensure that the Taler
Wallet is online at least once every three months to observe these
notifications. We shall not be held responsible or liable for any loss
of funds in the event that we discontinue or depreciate the Services
and your Taler Wallet fails to transfer out the coins within a three
months notification period.


No waiver
=========

Our failure to exercise or delay in exercising any right, power, or
privilege under this Agreement shall not operate as a waiver; nor
shall any single or partial exercise of any right, power, or privilege
preclude any other or further exercise thereof.


Severability
============

If it turns out that any part of this Agreement is invalid, void, or
for any reason unenforceable, that term will be deemed severable and
limited or eliminated to the minimum extent necessary.


Force majeure
=============

We shall not be held liable for any delays, failure in performance, or
interruptions of service which result directly or indirectly from any
cause or condition beyond our reasonable control, including but not
limited to: any delay or failure due to any act of God, act of civil
or military authorities, act of terrorism, civil disturbance, war,
strike or other labor dispute, fire, interruption in
telecommunications or Internet services or network provider services,
failure of equipment and/or software, other catastrophe, or any other
occurrence which is beyond our reasonable control and shall not affect
the validity and enforceability of any remaining provisions.


Assignment
==========

You agree that we may assign any of our rights and/or transfer, sub-
contract, or delegate any of our obligations under these Terms.


Entire agreement
================

This Agreement sets forth the entire understanding and agreement as to
the subject matter hereof and supersedes any and all prior
discussions, agreements, and understandings of any kind (including,
without limitation, any prior versions of this Agreement) and every
nature between us. Except as provided for above, any modification to
this Agreement must be in writing and must be signed by both parties.


Questions or comments
=====================

We welcome comments, questions, concerns, or suggestions. Please send
us a message on our contact page at legal@taler-systems.com.

`;

const termsXml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE document PUBLIC "+//IDN docutils.sourceforge.net//DTD Docutils Generic//EN//XML" "http://docutils.sourceforge.net/docs/ref/docutils.dtd">
<!-- Generated by Docutils 0.14 -->
<document source="/home/grothoff/research/taler/exchange/contrib/tos/tos.rst">
    <section ids="terms-of-service" names="terms\ of\ service">
        <title>Terms Of Service</title>
        <paragraph>Last Updated: 12.4.2019</paragraph>
        <paragraph>Welcome! Taler Systems SA (“we,” “our,” or “us”) provides a payment service
            through our Internet presence (collectively the “Services”). Before using our
            Services, please read the Terms of Service (the “Terms” or the “Agreement”)
            carefully.</paragraph>
        <section ids="overview" names="overview">
            <title>Overview</title>
            <paragraph>This section provides a brief summary of the highlights of this
                Agreement. Please note that when you accept this Agreement, you are accepting
                all of the terms and conditions and not just this section. We and possibly
                other third parties provide Internet services which interact with the Taler
                Wallet’s self-hosted personal payment application. When using the Taler Wallet
                to interact with our Services, you are agreeing to our Terms, so please read
                carefully.</paragraph>
            <section ids="highlights" names="highlights:">
                <title>Highlights:</title>
                <block_quote>
                    <bullet_list bullet="•">
                        <list_item>
                            <paragraph>You are responsible for keeping the data in your Taler Wallet at all times
                                under your control. Any losses arising from you not being in control of
                                your private information are your problem.</paragraph>
                        </list_item>
                        <list_item>
                            <paragraph>We will try to transfer funds we hold in escrow for our users to any legal
                                recipient to the best of our ability within the limitations of the law and
                                our implementation. However, the Services offered today are highly
                                experimental and the set of recipients of funds is severely restricted.</paragraph>
                        </list_item>
                        <list_item>
                            <paragraph>For our Services, we may charge transaction fees. The specific fee structure
                                is provided based on the Taler protocol and should be shown to you when you
                                withdraw electronic coins using a Taler Wallet. You agree and understand
                                that the Taler protocol allows for the fee structure to change.</paragraph>
                        </list_item>
                        <list_item>
                            <paragraph>You agree to not intentionally overwhelm our systems with requests and
                                follow responsible disclosure if you find security issues in our services.</paragraph>
                        </list_item>
                        <list_item>
                            <paragraph>We cannot be held accountable for our Services not being available due to
                                circumstances beyond our control. If we modify or terminate our services,
                                we will try to give you the opportunity to recover your funds. However,
                                given the experimental state of the Services today, this may not be
                                possible. You are strongly advised to limit your use of the Service
                                to small-scale experiments expecting total loss of all funds.</paragraph>
                        </list_item>
                    </bullet_list>
                </block_quote>
                <paragraph>These terms outline approved uses of our Services. The Services and these
                    Terms are still at an experimental stage. If you have any questions or
                    comments related to this Agreement, please send us a message to
                    <reference refuri="mailto:legal@taler-systems.com">legal@taler-systems.com</reference>. If you do not agree to this Agreement, you must not
                    use our Services.</paragraph>
            </section>
        </section>
        <section ids="how-you-accept-this-policy" names="how\ you\ accept\ this\ policy">
            <title>How you accept this policy</title>
            <paragraph>By sending funds to us (to top-up your Taler Wallet), you acknowledge that you
                have read, understood, and agreed to these Terms. We reserve the right to
                change these Terms at any time. If you disagree with the change, we may in the
                future offer you with an easy option to recover your unspent funds. However,
                in the current experimental period you acknowledge that this feature is not
                yet available, resulting in your funds being lost unless you accept the new
                Terms. If you continue to use our Services other than to recover your unspent
                funds, your continued use of our Services following any such change will
                signify your acceptance to be bound by the then current Terms. Please check
                the effective date above to determine if there have been any changes since you
                have last reviewed these Terms.</paragraph>
        </section>
        <section ids="services" names="services">
            <title>Services</title>
            <paragraph>We will try to transfer funds that we hold in escrow for our users to any
                legal recipient to the best of our ability and within the limitations of the
                law and our implementation. However, the Services offered today are highly
                experimental and the set of recipients of funds is severely restricted.  The
                Taler Wallet can be loaded by exchanging fiat currencies against electronic
                coins. We are providing this exchange service. Once your Taler Wallet is
                loaded with electronic coins they can be spent for purchases if the seller is
                accepting Taler as a means of payment. We are not guaranteeing that any seller
                is accepting Taler at all or a particular seller.  The seller or recipient of
                deposits of electronic coins must specify the target account, as per the
                design of the Taler protocol. They are responsible for following the protocol
                and specifying the correct bank account, and are solely liable for any losses
                that may arise from specifying the wrong account. We will allow the government
                to link wire transfers to the underlying contract hash. It is the
                responsibility of recipients to preserve the full contracts and to pay
                whatever taxes and charges may be applicable. Technical issues may lead to
                situations where we are unable to make transfers at all or lead to incorrect
                transfers that cannot be reversed. We will only refuse to execute transfers if
                the transfers are prohibited by a competent legal authority and we are ordered
                to do so.</paragraph>
        </section>
        <section ids="fees" names="fees">
            <title>Fees</title>
            <paragraph>You agree to pay the fees for exchanges and withdrawals completed via the
                Taler Wallet (“Fees”) as defined by us, which we may change from time to
                time. With the exception of wire transfer fees, Taler transaction fees are set
                for any electronic coin at the time of withdrawal and fixed throughout the
                validity period of the respective electronic coin. Your wallet should obtain
                and display applicable fees when withdrawing funds. Fees for coins obtained as
                change may differ from the fees applicable to the original coin. Wire transfer
                fees that are independent from electronic coins may change annually.  You
                authorize us to charge or deduct applicable fees owed in connection with
                deposits, exchanges and withdrawals following the rules of the Taler protocol.
                We reserve the right to provide different types of rewards to users either in
                the form of discount for our Services or in any other form at our discretion
                and without prior notice to you.</paragraph>
        </section>
        <section ids="eligibility" names="eligibility">
            <title>Eligibility</title>
            <paragraph>To be eligible to use our Services, you must be able to form legally binding
                contracts or have the permission of your legal guardian. By using our
                Services, you represent and warrant that you meet all eligibility requirements
                that we outline in these Terms.</paragraph>
        </section>
        <section ids="financial-self-responsibility" names="financial\ self-responsibility">
            <title>Financial self-responsibility</title>
            <paragraph>You will be responsible for maintaining the availability, integrity and
                confidentiality of the data stored in your wallet. When you setup a Taler
                Wallet, you are strongly advised to follow the precautionary measures offered
                by the software to minimize the chances to losse access to or control over
                your Wallet data. We will not be liable for any loss or damage arising from
                your failure to comply with this paragraph.</paragraph>
        </section>
        <section ids="copyrights-and-trademarks" names="copyrights\ and\ trademarks">
            <title>Copyrights and trademarks</title>
            <paragraph>The Taler Wallet is released under the terms of the GNU General Public License
                (GNU GPL). You have the right to access, use, and share the Taler Wallet, in
                modified or unmodified form. However, the GPL is a strong copyleft license,
                which means that any derivative works must be distributed under the same
                license terms as the original software. If you have any questions, you should
                review the GNU GPL’s full terms and conditions at
                <reference refuri="https://www.gnu.org/licenses/gpl-3.0.en.html">https://www.gnu.org/licenses/gpl-3.0.en.html</reference>.  “Taler” itself is a trademark
                of Taler Systems SA. You are welcome to use the name in relation to processing
                payments using the Taler protocol, assuming your use is compatible with an
                official release from the GNU Project that is not older than two years.</paragraph>
        </section>
        <section ids="your-use-of-our-services" names="your\ use\ of\ our\ services">
            <title>Your use of our services</title>
            <paragraph>When using our Services, you agree to not take any action that intentionally
                imposes an unreasonable load on our infrastructure. If you find security
                problems in our Services, you agree to first report them to
                <reference refuri="mailto:security@taler-systems.com">security@taler-systems.com</reference> and grant us the right to publish your report. We
                warrant that we will ourselves publicly disclose any issues reported within 3
                months, and that we will not prosecute anyone reporting security issues if
                they did not exploit the issue beyond a proof-of-concept, and followed the
                above responsible disclosure practice.</paragraph>
        </section>
        <section ids="limitation-of-liability-disclaimer-of-warranties" names="limitation\ of\ liability\ &amp;\ disclaimer\ of\ warranties">
            <title>Limitation of liability &amp; disclaimer of warranties</title>
            <paragraph>You understand and agree that we have no control over, and no duty to take any
                action regarding: Failures, disruptions, errors, or delays in processing that
                you may experience while using our Services; The risk of failure of hardware,
                software, and Internet connections; The risk of malicious software being
                introduced or found in the software underlying the Taler Wallet; The risk that
                third parties may obtain unauthorized access to information stored within your
                Taler Wallet, including, but not limited to your Taler Wallet coins or backup
                encryption keys.  You release us from all liability related to any losses,
                damages, or claims arising from:</paragraph>
            <enumerated_list enumtype="loweralpha" prefix="(" suffix=")">
                <list_item>
                    <paragraph>user error such as forgotten passwords, incorrectly constructed
                        transactions;</paragraph>
                </list_item>
                <list_item>
                    <paragraph>server failure or data loss;</paragraph>
                </list_item>
                <list_item>
                    <paragraph>unauthorized access to the Taler Wallet application;</paragraph>
                </list_item>
                <list_item>
                    <paragraph>bugs or other errors in the Taler Wallet software; and</paragraph>
                </list_item>
                <list_item>
                    <paragraph>any unauthorized third party activities, including, but not limited to,
                        the use of viruses, phishing, brute forcing, or other means of attack
                        against the Taler Wallet. We make no representations concerning any
                        Third Party Content contained in or accessed through our Services.</paragraph>
                </list_item>
            </enumerated_list>
            <paragraph>Any other terms, conditions, warranties, or representations associated with
                such content, are solely between you and such organizations and/or
                individuals.</paragraph>
        </section>
        <section ids="limitation-of-liability" names="limitation\ of\ liability">
            <title>Limitation of liability</title>
            <paragraph>To the fullest extent permitted by applicable law, in no event will we or any
                of our officers, directors, representatives, agents, servants, counsel,
                employees, consultants, lawyers, and other personnel authorized to act,
                acting, or purporting to act on our behalf (collectively the “Taler Parties”)
                be liable to you under contract, tort, strict liability, negligence, or any
                other legal or equitable theory, for:</paragraph>
            <enumerated_list enumtype="loweralpha" prefix="(" suffix=")">
                <list_item>
                    <paragraph>any lost profits, data loss, cost of procurement of substitute goods or
                        services, or direct, indirect, incidental, special, punitive, compensatory,
                        or consequential damages of any kind whatsoever resulting from:</paragraph>
                </list_item>
            </enumerated_list>
            <block_quote>
                <enumerated_list enumtype="lowerroman" prefix="(" suffix=")">
                    <list_item>
                        <paragraph>your use of, or conduct in connection with, our services;</paragraph>
                    </list_item>
                    <list_item>
                        <paragraph>any unauthorized use of your wallet and/or private key due to your
                            failure to maintain the confidentiality of your wallet;</paragraph>
                    </list_item>
                    <list_item>
                        <paragraph>any interruption or cessation of transmission to or from the services; or</paragraph>
                    </list_item>
                    <list_item>
                        <paragraph>any bugs, viruses, trojan horses, or the like that are found in the Taler
                            Wallet software or that may be transmitted to or through our services by
                            any third party (regardless of the source of origination), or</paragraph>
                    </list_item>
                </enumerated_list>
            </block_quote>
            <enumerated_list enumtype="loweralpha" prefix="(" start="2" suffix=")">
                <list_item>
                    <paragraph>any direct damages.</paragraph>
                </list_item>
            </enumerated_list>
            <paragraph>These limitations apply regardless of legal theory, whether based on tort,
                strict liability, breach of contract, breach of warranty, or any other legal
                theory, and whether or not we were advised of the possibility of such
                damages. Some jurisdictions do not allow the exclusion or limitation of
                liability for consequential or incidental damages, so the above limitation may
                not apply to you.</paragraph>
        </section>
        <section ids="warranty-disclaimer" names="warranty\ disclaimer">
            <title>Warranty disclaimer</title>
            <paragraph>Our services are provided “as is” and without warranty of any kind. To the
                maximum extent permitted by law, we disclaim all representations and
                warranties, express or implied, relating to the services and underlying
                software or any content on the services, whether provided or owned by us or by
                any third party, including without limitation, warranties of merchantability,
                fitness for a particular purpose, title, non-infringement, freedom from
                computer virus, and any implied warranties arising from course of dealing,
                course of performance, or usage in trade, all of which are expressly
                disclaimed. In addition, we do not represent or warrant that the content
                accessible via the services is accurate, complete, available, current, free of
                viruses or other harmful components, or that the results of using the services
                will meet your requirements. Some states do not allow the disclaimer of
                implied warranties, so the foregoing disclaimers may not apply to you. This
                paragraph gives you specific legal rights and you may also have other legal
                rights that vary from state to state.</paragraph>
        </section>
        <section ids="indemnity" names="indemnity">
            <title>Indemnity</title>
            <paragraph>To the extent permitted by applicable law, you agree to defend, indemnify, and
                hold harmless the Taler Parties from and against any and all claims, damages,
                obligations, losses, liabilities, costs or debt, and expenses (including, but
                not limited to, attorney’s fees) arising from: (a) your use of and access to
                the Services; (b) any feedback or submissions you provide to us concerning the
                Taler Wallet; (c) your violation of any term of this Agreement; or (d) your
                violation of any law, rule, or regulation, or the rights of any third party.</paragraph>
        </section>
        <section ids="time-limitation-on-claims" names="time\ limitation\ on\ claims">
            <title>Time limitation on claims</title>
            <paragraph>You agree that any claim you may have arising out of or related to your
                relationship with us must be filed within one year after such claim arises,
                otherwise, your claim in permanently barred.</paragraph>
        </section>
        <section ids="governing-law" names="governing\ law">
            <title>Governing law</title>
            <paragraph>No matter where you’re located, the laws of Switzerland will govern these
                Terms. If any provisions of these Terms are inconsistent with any applicable
                law, those provisions will be superseded or modified only to the extent such
                provisions are inconsistent. The parties agree to submit to the ordinary
                courts in Zurich, Switzerland for exclusive jurisdiction of any dispute
                arising out of or related to your use of the Services or your breach of these
                Terms.</paragraph>
        </section>
        <section ids="termination" names="termination">
            <title>Termination</title>
            <paragraph>In the event of termination concerning your use of our Services, your
                obligations under this Agreement will still continue.</paragraph>
        </section>
        <section ids="discontinuance-of-services" names="discontinuance\ of\ services">
            <title>Discontinuance of services</title>
            <paragraph>We may, in our sole discretion and without cost to you, with or without prior
                notice, and at any time, modify or discontinue, temporarily or permanently,
                any portion of our Services. We will use the Taler protocol’s provisions to
                notify Wallets if our Services are to be discontinued. It is your
                responsibility to ensure that the Taler Wallet is online at least once every
                three months to observe these notifications. We shall not be held responsible
                or liable for any loss of funds in the event that we discontinue or depreciate
                the Services and your Taler Wallet fails to transfer out the coins within a
                three months notification period.</paragraph>
        </section>
        <section ids="no-waiver" names="no\ waiver">
            <title>No waiver</title>
            <paragraph>Our failure to exercise or delay in exercising any right, power, or privilege
                under this Agreement shall not operate as a waiver; nor shall any single or
                partial exercise of any right, power, or privilege preclude any other or
                further exercise thereof.</paragraph>
        </section>
        <section ids="severability" names="severability">
            <title>Severability</title>
            <paragraph>If it turns out that any part of this Agreement is invalid, void, or for any
                reason unenforceable, that term will be deemed severable and limited or
                eliminated to the minimum extent necessary.</paragraph>
        </section>
        <section ids="force-majeure" names="force\ majeure">
            <title>Force majeure</title>
            <paragraph>We shall not be held liable for any delays, failure in performance, or
                interruptions of service which result directly or indirectly from any cause or
                condition beyond our reasonable control, including but not limited to: any
                delay or failure due to any act of God, act of civil or military authorities,
                act of terrorism, civil disturbance, war, strike or other labor dispute, fire,
                interruption in telecommunications or Internet services or network provider
                services, failure of equipment and/or software, other catastrophe, or any
                other occurrence which is beyond our reasonable control and shall not affect
                the validity and enforceability of any remaining provisions.</paragraph>
        </section>
        <section ids="assignment" names="assignment">
            <title>Assignment</title>
            <paragraph>You agree that we may assign any of our rights and/or transfer, sub-contract,
                or delegate any of our obligations under these Terms.</paragraph>
        </section>
        <section ids="entire-agreement" names="entire\ agreement">
            <title>Entire agreement</title>
            <paragraph>This Agreement sets forth the entire understanding and agreement as to the
                subject matter hereof and supersedes any and all prior discussions,
                agreements, and understandings of any kind (including, without limitation, any
                prior versions of this Agreement) and every nature between us. Except as
                provided for above, any modification to this Agreement must be in writing and
                must be signed by both parties.</paragraph>
        </section>
        <section ids="questions-or-comments" names="questions\ or\ comments">
            <title>Questions or comments</title>
            <paragraph>We welcome comments, questions, concerns, or suggestions. Please send us a
                message on our contact page at <reference refuri="mailto:legal@taler-systems.com">legal@taler-systems.com</reference>.</paragraph>
        </section>
    </section>
</document>
`;

export const NewTerms = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "xml",
      document: new DOMParser().parseFromString(termsXml, "text/xml"),
    },
    status: "new",
  },
});

export const TermsReviewingPLAIN = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "plain",
      content: termsPlain,
    },
    status: "new",
  },
  reviewing: true,
});

export const TermsReviewingHTML = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "html",
      href: new URL(
        `data:text/html;base64,${Buffer.from(termsHtml).toString("base64")}`,
      ),
    },
    status: "new",
  },
  reviewing: true,
});

const termsPdf = `
%PDF-1.2 
9 0 obj << >> 
stream
BT/ 9 Tf(This is the Exchange TERMS OF SERVICE)' ET
endstream
endobj
4 0 obj << /Type /Page /Parent 5 0 R /Contents 9 0 R >> endobj 
5 0 obj << /Kids [4 0 R ] /Count 1 /Type /Pages /MediaBox [ 0 0 180 20 ] >> endobj
3 0 obj << /Pages 5 0 R /Type /Catalog >> endobj
trailer
<< /Root 3 0 R >>
%%EOF
`;

export const TermsReviewingPDF = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "pdf",
      location: new URL(
        `data:text/html;base64,${Buffer.from(termsPdf).toString("base64")}`,
      ),
    },
    status: "new",
  },
  reviewing: true,
});

export const TermsReviewingXML = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "xml",
      document: new DOMParser().parseFromString(termsXml, "text/xml"),
    },
    status: "new",
  },
  reviewing: true,
});

export const NewTermsAccepted = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },
  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "xml",
      document: new DOMParser().parseFromString(termsXml, "text/xml"),
    },
    status: "new",
  },
  reviewed: true,
});

export const TermsShowAgainXML = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "xml",
      document: new DOMParser().parseFromString(termsXml, "text/xml"),
    },
    status: "new",
  },
  reviewed: true,
  reviewing: true,
});

export const TermsChanged = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "xml",
      document: new DOMParser().parseFromString(termsXml, "text/xml"),
    },
    status: "changed",
  },
});

export const TermsNotFound = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    status: "notfound",
  },
});

export const TermsAlreadyAccepted = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: amountFractionalBase * 0.5,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    status: "accepted",
  },
});

export const WithoutFee = createExample(TestedComponent, {
  knownExchanges: [
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.demo.taler.net",
      paytoUris: ["asd"],
    },
    {
      currency: "USD",
      exchangeBaseUrl: "exchange.test.taler.net",
      paytoUris: ["asd"],
    },
  ],
  exchangeBaseUrl: "exchange.demo.taler.net",
  withdrawalFee: {
    currency: "USD",
    fraction: 0,
    value: 0,
  },
  amount: {
    currency: "USD",
    value: 2,
    fraction: 10000000,
  },

  onSwitchExchange: async () => {
    null;
  },
  terms: {
    value: {
      type: "xml",
      document: new DOMParser().parseFromString(termsXml, "text/xml"),
    },
    status: "accepted",
  },
});
