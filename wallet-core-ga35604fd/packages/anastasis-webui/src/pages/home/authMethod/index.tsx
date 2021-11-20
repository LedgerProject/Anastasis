import { AuthMethod } from "anastasis-core";
import { h, VNode } from "preact";
import postalIcon from "../../../assets/icons/auth_method/postal.svg";
import questionIcon from "../../../assets/icons/auth_method/question.svg";
import smsIcon from "../../../assets/icons/auth_method/sms.svg";
import videoIcon from "../../../assets/icons/auth_method/video.svg";
import { AuthMethodEmailSetup as EmailSetup } from "./AuthMethodEmailSetup";
import { AuthMethodEmailSolve as EmailSolve } from "./AuthMethodEmailSolve";
import { AuthMethodIbanSetup as IbanSetup } from "./AuthMethodIbanSetup";
import { AuthMethodPostSetup as PostalSetup } from "./AuthMethodPostSetup";
import { AuthMethodQuestionSetup as QuestionSetup } from "./AuthMethodQuestionSetup";
import { AuthMethodSmsSetup as SmsSetup } from "./AuthMethodSmsSetup";
import { AuthMethodTotpSetup as TotpSetup } from "./AuthMethodTotpSetup";
import { AuthMethodVideoSetup as VideoSetup } from "./AuthMethodVideoSetup";

import { AuthMethodIbanSolve as IbanSolve } from "./AuthMethodIbanSolve";
import { AuthMethodPostSolve as PostalSolve } from "./AuthMethodPostSolve";
import { AuthMethodQuestionSolve as QuestionSolve } from "./AuthMethodQuestionSolve";
import { AuthMethodSmsSolve as SmsSolve } from "./AuthMethodSmsSolve";
import { AuthMethodTotpSolve as TotpSolve } from "./AuthMethodTotpSolve";
import { AuthMethodVideoSolve as VideoSolve } from "./AuthMethodVideoSolve";

export type AuthMethodWithRemove = AuthMethod & { remove: () => void };

export interface AuthMethodSetupProps {
  method: string;
  addAuthMethod: (x: any) => void;
  configured: AuthMethodWithRemove[];
  cancel: () => void;
}

export interface AuthMethodSolveProps {
  id: string;
}

interface AuthMethodConfiguration {
  icon: VNode;
  label: string;
  setup: (props: AuthMethodSetupProps) => VNode;
  solve: (props: AuthMethodSolveProps) => VNode;
  skip?: boolean;
}
// export type KnownAuthMethods = "sms" | "email" | "post" | "question" | "video" | "totp" | "iban";

const ALL_METHODS = [
  "sms",
  "email",
  "post",
  "question",
  "video",
  "totp",
  "iban",
] as const;
export type KnownAuthMethods = typeof ALL_METHODS[number];
export function isKnownAuthMethods(value: string): value is KnownAuthMethods {
  return ALL_METHODS.includes(value as KnownAuthMethods);
}

type KnowMethodConfig = {
  [name in KnownAuthMethods]: AuthMethodConfiguration;
};

export const authMethods: KnowMethodConfig = {
  question: {
    icon: <img src={questionIcon} />,
    label: "Question",
    setup: QuestionSetup,
    solve: QuestionSolve,
  },
  sms: {
    icon: <img src={smsIcon} />,
    label: "SMS",
    setup: SmsSetup,
    solve: SmsSolve,
  },
  email: {
    icon: <i class="mdi mdi-email" />,
    label: "Email",
    setup: EmailSetup,
    solve: EmailSolve,
  },
  iban: {
    icon: <i class="mdi mdi-bank" />,
    label: "IBAN",
    setup: IbanSetup,
    solve: IbanSolve,
  },
  post: {
    icon: <img src={postalIcon} />,
    label: "Physical mail",
    setup: PostalSetup,
    solve: PostalSolve,
  },
  totp: {
    icon: <i class="mdi mdi-devices" />,
    label: "TOTP",
    setup: TotpSetup,
    solve: TotpSolve,
  },
  video: {
    icon: <img src={videoIcon} />,
    label: "Video",
    setup: VideoSetup,
    solve: VideoSolve,
    skip: true,
  },
};
