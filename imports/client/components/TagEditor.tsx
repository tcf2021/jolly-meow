import { useTracker } from "meteor/react-meteor-data";
import React, { Suspense, useCallback } from "react";
import { useTranslation as useStudioTranslation } from "react-i18next";
import styled, { useTheme } from "styled-components";
import type { PuzzleType } from "../../lib/models/Puzzles";
import Tags from "../../lib/models/Tags";
import studioI18n from "../i18n";
import Loading from "./Loading";

// Casting away the React.lazy because otherwise we lose access to the generic parameter
const Creatable = React.lazy(
  () => import("react-select/creatable"),
) as typeof import("react-select/creatable").default;

const TagEditorSpan = styled.span`
  display: inline;
  min-width: 200px;
  flex-basis: 100%;
  margin: 2px 0;
  background-color: ${({ theme }) => theme.colors.background};
`;

const TagEditor = ({
  puzzle,
  onSubmit,
  onCancel,
}: {
  puzzle: PuzzleType;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) => {
  useStudioTranslation();

  const allTags = useTracker(() => {
    return Tags.find({ hunt: puzzle.hunt }).fetch();
  }, [puzzle.hunt]);

  const onBlur = useCallback(() => {
    // Treat blur as "no I didn't mean to do that".  We may have to change this
    // once we have autocomplete .
    onCancel();
  }, [onCancel]);

  const options = allTags
    .map((t) => t.name)
    .filter(Boolean)
    .map((t) => {
      return { value: t, label: t };
    });

  const theme = useTheme();

  return (
    <Suspense fallback={<Loading inline />}>
      <TagEditorSpan>
        <Creatable
          placeholder={studioI18n.t("studio.messages.m438")}
          noOptionsMessage={() => studioI18n.t("studio.messages.m439")}
          formatCreateLabel={(input) =>
            studioI18n.t("studio.templates.createTag", { p0: input })
          }
          options={options}
          autoFocus
          openMenuOnFocus
          onChange={(v) => v && onSubmit(v.value)}
          onBlur={onBlur}
          theme={theme.reactSelectTheme}
        />
      </TagEditorSpan>
    </Suspense>
  );
};

export default TagEditor;
