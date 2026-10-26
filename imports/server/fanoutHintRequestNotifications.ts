import { GLOBAL_SCOPE } from "../lib/isAdmin";
import HintRequestNotifications from "../lib/models/HintRequestNotifications";
import MeteorUsers from "../lib/models/MeteorUsers";

const OPERATOR_ROLE = "operator";
const ADMIN_ROLE = "admin";

export default async function fanoutHintRequestNotifications({
  hintId,
  huntId,
  puzzleId,
  requestedAt,
  requestedBy,
  kind,
}: {
  hintId: string;
  huntId: string;
  puzzleId: string;
  requestedAt: Date;
  requestedBy: string;
  kind?: "new" | "updated";
}) {
  const operatorField = `roles.${huntId}`;
  const adminField = `roles.${GLOBAL_SCOPE}`;

  const recipients = await MeteorUsers.find(
    {
      $or: [{ [operatorField]: OPERATOR_ROLE }, { [adminField]: ADMIN_ROLE }],
    },
    { fields: { _id: 1 } },
  ).fetchAsync();

  const recipientIds = [...new Set(recipients.map(({ _id }) => _id))];

  if (recipientIds.length === 0) {
    return;
  }

  await Promise.all(
    recipientIds.map((_id) =>
      HintRequestNotifications.upsertAsync(
        { user: _id, hint: hintId },
        {
          $set: {
            user: _id,
            hunt: huntId,
            puzzle: puzzleId,
            hint: hintId,
            requestedBy,
            requestedAt,
            kind,
          },
          $setOnInsert: {
            createdAt: requestedAt,
          },
        },
      ),
    ),
  );
}
