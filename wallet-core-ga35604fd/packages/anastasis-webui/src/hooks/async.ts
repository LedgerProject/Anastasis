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
import { useState } from "preact/hooks";
// import { cancelPendingRequest } from "./backend";

export interface Options {
  slowTolerance: number;
}

export interface AsyncOperationApi<T> {
  request: (...a: any) => void;
  cancel: () => void;
  data: T | undefined;
  isSlow: boolean;
  isLoading: boolean;
  error: string | undefined;
}

export function useAsync<T>(
  fn?: (...args: any) => Promise<T>,
  { slowTolerance: tooLong }: Options = { slowTolerance: 1000 },
): AsyncOperationApi<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(undefined);
  const [isSlow, setSlow] = useState(false);

  const request = async (...args: any) => {
    if (!fn) return;
    setLoading(true);
    const handler = setTimeout(() => {
      setSlow(true);
    }, tooLong);

    try {
      console.log("calling async", args);
      const result = await fn(...args);
      console.log("async back", result);
      setData(result);
    } catch (error) {
      setError(error);
    }
    setLoading(false);
    setSlow(false);
    clearTimeout(handler);
  };

  function cancel() {
    // cancelPendingRequest()
    setLoading(false);
    setSlow(false);
  }

  return {
    request,
    cancel,
    data,
    isSlow,
    isLoading,
    error,
  };
}
