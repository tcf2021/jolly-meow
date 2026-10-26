import HintAnswerNotifications from "../lib/models/HintAnswerNotifications";
import MeteorUsers from "../lib/models/MeteorUsers";

export default async function fanoutHintAnswerNotifications({
  hintId,
  huntId,
  puzzleId,
  answeredAt,
}: {
  hintId: string;
  huntId: string;
  puzzleId: string;
  answeredAt: Date;
}) {
  const recipients = await MeteorUsers.find(
    { hunts: huntId },
    { fields: { _id: 1 } },
  ).fetchAsync();

  await Promise.all(
    recipients.map(({ _id }) =>
      HintAnswerNotifications.upsertAsync(
        { user: _id, hint: hintId },
        {
          $set: {
            user: _id,
            hunt: huntId,
            puzzle: puzzleId,
            hint: hintId,
            answeredAt,
          },
          $setOnInsert: {
            createdAt: answeredAt,
          },
        },
      ),
    ),
  );
}
