import React, { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { usePuzzleLayoutState } from "../hooks/persisted-state";

const EdgeHandle = styled.button`
  position: fixed;
  z-index: 999;
  display: grid;
  place-items: center;
  width: 28px;
  height: 12px;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-top: 0;
  border-radius: 0 0 6px 6px;
  color: ${({ theme }) => theme.colors.breadcrumbText};
  background: ${({ theme }) => theme.colors.navBarBackground};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`;

type Position = { left: number; top: number };

const PuzzleLayoutControls = ({
  pageRef,
  metadataHidden,
  onToggleMetadata,
}: {
  pageRef: React.RefObject<HTMLDivElement | null>;
  metadataHidden: boolean;
  onToggleMetadata: () => void;
}) => {
  const [layout, setLayout] = usePuzzleLayoutState();
  const { t } = useTranslation();
  const [positions, setPositions] = useState<{
    navbar: Position;
    metadata?: Position;
  }>();

  // Follow the original region boundaries without reserving a toolbar row.
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return undefined;
    const workspace = page.querySelector<HTMLElement>(
      '[data-testid="puzzle-workspace-switcher"]',
    );
    const metadata = page.querySelector<HTMLElement>("#puzzle-metadata");
    const measure = () => {
      const pageRect = page.getBoundingClientRect();
      const center = pageRect.left + pageRect.width / 2 - 14;
      const next = {
        navbar: { left: center, top: pageRect.top },
        metadata: metadata
          ? {
              left: center,
              top: workspace
                ? workspace.getBoundingClientRect().top
                : metadataHidden
                  ? pageRect.top
                  : metadata.getBoundingClientRect().bottom,
            }
          : undefined,
      };
      if (next.metadata && Math.abs(next.metadata.top - pageRect.top) < 12) {
        next.navbar.left -= 16;
        next.metadata.left += 16;
      }
      setPositions((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const observer = new ResizeObserver(measure);
    for (const node of [
      page,
      workspace,
      metadata,
      document.getElementById("app-navbar"),
    ]) {
      if (node) observer.observe(node);
    }
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  const controls = [
    {
      position: positions?.navbar,
      expanded: !layout.navbarHidden,
      label: t(
        layout.navbarHidden ? "studio.layout.showNav" : "studio.layout.hideNav",
      ),
      target: "app-navbar",
      testId: "toggle-navbar",
      onClick: () =>
        setLayout((previous) => ({
          ...previous,
          navbarHidden: !previous.navbarHidden,
        })),
    },
    {
      position: positions?.metadata,
      expanded: !metadataHidden,
      label: t(
        metadataHidden
          ? "puzzle.pageView.showInfo"
          : "puzzle.pageView.hideInfo",
        metadataHidden ? "Show puzzle info" : "Hide puzzle info",
      ),
      target: "puzzle-metadata",
      testId: "toggle-metadata",
      onClick: onToggleMetadata,
    },
  ];
  return (
    <div style={{ display: "contents" }}>
      {controls.map(({ position, expanded, label, target, testId, onClick }) =>
        position ? (
          <EdgeHandle
            key={target}
            type="button"
            style={position}
            aria-label={label}
            aria-expanded={expanded}
            aria-controls={target}
            title={label}
            data-testid={testId}
            onClick={onClick}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden="true"
              focusable="false"
              style={{ transform: `rotate(${expanded ? 0 : 180}deg)` }}
            >
              <path
                d="M3 7.5 6 4.5 9 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </EdgeHandle>
        ) : null,
      )}
    </div>
  );
};

export default PuzzleLayoutControls;
