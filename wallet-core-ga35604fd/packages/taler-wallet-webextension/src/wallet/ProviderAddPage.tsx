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

import {
  Amounts,
  BackupBackupProviderTerms,
  canonicalizeBaseUrl,
  i18n,
} from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Checkbox } from "../components/Checkbox";
import { ErrorMessage } from "../components/ErrorMessage";
import {
  Button,
  ButtonPrimary,
  Input,
  LightText,
  SmallLightText,
} from "../components/styled/index";
import * as wxApi from "../wxApi";

interface Props {
  currency: string;
  onBack: () => void;
}

function getJsonIfOk(r: Response) {
  if (r.ok) {
    return r.json();
  } else {
    if (r.status >= 400 && r.status < 500) {
      throw new Error(`URL may not be right: (${r.status}) ${r.statusText}`);
    } else {
      throw new Error(
        `Try another server: (${r.status}) ${
          r.statusText || "internal server error"
        }`,
      );
    }
  }
}

export function ProviderAddPage({ onBack }: Props): VNode {
  const [verifying, setVerifying] = useState<
    | { url: string; name: string; provider: BackupBackupProviderTerms }
    | undefined
  >(undefined);

  async function getProviderInfo(
    url: string,
  ): Promise<BackupBackupProviderTerms> {
    return fetch(new URL("config", url).href)
      .catch((e) => {
        throw new Error(`Network error`);
      })
      .then(getJsonIfOk);
  }

  if (!verifying) {
    return (
      <SetUrlView
        onCancel={onBack}
        onVerify={(url) => getProviderInfo(url)}
        onConfirm={(url, name) =>
          getProviderInfo(url)
            .then((provider) => {
              setVerifying({ url, name, provider });
            })
            .catch((e) => e.message)
        }
      />
    );
  }
  return (
    <ConfirmProviderView
      provider={verifying.provider}
      url={verifying.url}
      onCancel={() => {
        setVerifying(undefined);
      }}
      onConfirm={() => {
        wxApi.addBackupProvider(verifying.url, verifying.name).then(onBack);
      }}
    />
  );
}

export interface SetUrlViewProps {
  initialValue?: string;
  onCancel: () => void;
  onVerify: (s: string) => Promise<BackupBackupProviderTerms | undefined>;
  onConfirm: (url: string, name: string) => Promise<string | undefined>;
  withError?: string;
}

export function SetUrlView({
  initialValue,
  onCancel,
  onVerify,
  onConfirm,
  withError,
}: SetUrlViewProps) {
  const [value, setValue] = useState<string>(initialValue || "");
  const [urlError, setUrlError] = useState(false);
  const [name, setName] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(withError);
  useEffect(() => {
    try {
      const url = canonicalizeBaseUrl(value);
      onVerify(url)
        .then((r) => {
          setUrlError(false);
          setName(new URL(url).hostname);
        })
        .catch(() => {
          setUrlError(true);
          setName(undefined);
        });
    } catch {
      setUrlError(true);
      setName(undefined);
    }
  }, [value]);
  return (
    <Fragment>
      <section>
        <h1> Add backup provider</h1>
        <ErrorMessage
          title={error && "Could not get provider information"}
          description={error}
        />
        <LightText> Backup providers may charge for their service</LightText>
        <p>
          <Input invalid={urlError}>
            <label>URL</label>
            <input
              type="text"
              placeholder="https://"
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
            />
          </Input>
          <Input>
            <label>Name</label>
            <input
              type="text"
              disabled={name === undefined}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Input>
        </p>
      </section>
      <footer>
        <Button onClick={onCancel}>
          <i18n.Translate> &lt; Back</i18n.Translate>
        </Button>
        <ButtonPrimary
          disabled={!value && !urlError}
          onClick={() => {
            const url = canonicalizeBaseUrl(value);
            return onConfirm(url, name!).then((r) =>
              r ? setError(r) : undefined,
            );
          }}
        >
          <i18n.Translate>Next</i18n.Translate>
        </ButtonPrimary>
      </footer>
    </Fragment>
  );
}

export interface ConfirmProviderViewProps {
  provider: BackupBackupProviderTerms;
  url: string;
  onCancel: () => void;
  onConfirm: () => void;
}
export function ConfirmProviderView({
  url,
  provider,
  onCancel,
  onConfirm,
}: ConfirmProviderViewProps) {
  const [accepted, setAccepted] = useState(false);

  return (
    <Fragment>
      <section>
        <h1>Review terms of service</h1>
        <div>
          Provider URL:{" "}
          <a href={url} target="_blank">
            {url}
          </a>
        </div>
        <SmallLightText>
          Please review and accept this provider's terms of service
        </SmallLightText>
        <h2>1. Pricing</h2>
        <p>
          {Amounts.isZero(provider.annual_fee)
            ? "free of charge"
            : `${provider.annual_fee} per year of service`}
        </p>
        <h2>2. Storage</h2>
        <p>
          {provider.storage_limit_in_megabytes} megabytes of storage per year of
          service
        </p>
        <Checkbox
          label="Accept terms of service"
          name="terms"
          onToggle={() => setAccepted((old) => !old)}
          enabled={accepted}
        />
      </section>
      <footer>
        <Button onClick={onCancel}>
          <i18n.Translate> &lt; Back</i18n.Translate>
        </Button>
        <ButtonPrimary disabled={!accepted} onClick={onConfirm}>
          <i18n.Translate>Add provider</i18n.Translate>
        </ButtonPrimary>
      </footer>
    </Fragment>
  );
}
