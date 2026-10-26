import { Meteor } from "meteor/meteor";
import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import findPuzzleByUrl from "../../methods/findPuzzleByUrl";

type RedirectTo = {
  path: string;
  state?: any; // or make it stricter if you want
} | null;

const PuzzleUrlRedirector = () => {
  const puzzleUrl = useParams().puzzleUrl!;
  const puzzleTitle = useParams().puzzleTitle!;
  const huntId = useParams().huntId!;
  const [redirectTo, setRedirectTo] = useState<RedirectTo>(null);

  findPuzzleByUrl.call(
    {
      puzzleUrl,
    },
    (error, puzzleId) => {
      if (
        error instanceof Meteor.Error &&
        typeof error.error === "number" &&
        error.error === 404
      ) {
        setRedirectTo({
          path: `/hunts/${huntId}/puzzles`,
          state: { puzzleUrl, puzzleTitle },
        });
      } else {
        setRedirectTo({
          path: `/hunts/${huntId}/puzzles/${puzzleId}`,
          state: undefined,
        });
      }
    },
  );

  if (redirectTo) {
    return <Navigate to={redirectTo.path} state={redirectTo.state} replace />;
  }

  // Optional: loading placeholder while waiting
  return null;
};

export default PuzzleUrlRedirector;
