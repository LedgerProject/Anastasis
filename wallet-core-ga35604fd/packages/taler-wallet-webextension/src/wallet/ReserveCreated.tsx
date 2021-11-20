import { AmountJson, Amounts, parsePaytoUri } from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { BankDetailsByPaytoType } from "../components/BankDetailsByPaytoType";
import { QR } from "../components/QR";
import { ButtonDestructive, WarningBox } from "../components/styled";
export interface Props {
  reservePub: string;
  payto: string;
  exchangeBaseUrl: string;
  amount: AmountJson;
  onBack: () => void;
}

export function ReserveCreated({
  reservePub,
  payto,
  onBack,
  exchangeBaseUrl,
  amount,
}: Props): VNode {
  const paytoURI = parsePaytoUri(payto);
  // const url = new URL(paytoURI?.targetPath);
  if (!paytoURI) {
    return <div>could not parse payto uri from exchange {payto}</div>;
  }
  return (
    <Fragment>
      <section>
        <h1>Exchange is ready for withdrawal!</h1>
        <p>
          To complete the process you need to wire{" "}
          <b>{Amounts.stringify(amount)}</b> to the exchange bank account
        </p>
        <BankDetailsByPaytoType
          amount={Amounts.stringify(amount)}
          exchangeBaseUrl={exchangeBaseUrl}
          payto={paytoURI}
          subject={reservePub}
        />
        <p>
          <WarningBox>
            Make sure to use the correct subject, otherwise the money will not
            arrive in this wallet.
          </WarningBox>
        </p>
      </section>
      <section>
        <p>
          Alternative, you can also scan this QR code or open{" "}
          <a href={payto}>this link</a> if you have a banking app installed that
          supports RFC 8905
        </p>
        <QR text={payto} />
      </section>
      <footer>
        <div />
        <ButtonDestructive onClick={onBack}>
          Cancel withdrawal
        </ButtonDestructive>
      </footer>
    </Fragment>
  );
}
