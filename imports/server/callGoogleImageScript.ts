import { Meteor } from "meteor/meteor";

export default async function callGoogleImageScript(
  app: { endpointUrl: string; sharedSecret: string },
  method: "listSheets" | "insertImage",
  parameters: Record<string, string>,
) {
  try {
    const response = await fetch(app.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: app.sharedSecret, method, parameters }),
      signal: AbortSignal.timeout(method === "insertImage" ? 45_000 : 20_000),
    });
    if (!response.ok)
      throw new Meteor.Error(
        response.status === 401 || response.status === 403
          ? "google-script-rejected"
          : "google-script-unavailable",
        "The Google image service is temporarily unavailable.",
      );
    let json;
    try {
      json = await response.json();
    } catch {
      throw new Meteor.Error(
        "google-script-response",
        "The Google image service did not return a valid response. Check its deployment and access settings.",
      );
    }
    if (json?.ok !== true)
      throw new Meteor.Error(
        json.error === "Invalid sheet ID"
          ? "google-script-sheet-missing"
          : "google-script-rejected",
        "The Google image service rejected the request. Check its authorization and spreadsheet access.",
      );
    return json;
  } catch (error) {
    if (error instanceof Meteor.Error) throw error;
    throw new Meteor.Error(
      error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
        ? "google-script-timeout"
        : "google-script-unavailable",
      method === "insertImage"
        ? "The Google image service did not confirm insertion. Check the sheet before retrying to avoid duplicate images."
        : "Could not reach Google. Please retry shortly.",
    );
  }
}
