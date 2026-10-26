import { Meteor } from "meteor/meteor";
import withLock from "./withLock";

export default function withRenewedLock<T>(
  name: string,
  criticalSection: () => Promise<T>,
) {
  return withLock(name, async (renew) => {
    let lockError: unknown;
    const heartbeat = Meteor.setInterval(() => {
      void renew().catch((error: unknown) => {
        lockError = error;
      });
    }, 3000);
    try {
      const result = await criticalSection();
      if (lockError)
        throw lockError instanceof Error
          ? lockError
          : new Error("Lock renewal failed");
      return result;
    } finally {
      Meteor.clearInterval(heartbeat);
    }
  });
}
