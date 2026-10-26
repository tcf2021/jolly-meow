import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { getAvatarCdnUrl } from "../../lib/discord";
import type { DiscordAccountType } from "../../lib/models/DiscordAccount";

const AvatarImg = styled.img`
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const AvatarInitial = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  color: ${({ theme }) => theme.colors.avatarInitialText};
  background-color: ${({ theme }) => theme.colors.avatarInitialBackground};
`;

const DefaultAvatarInner = ({
  _id,
  displayName,
}: {
  _id?: string;
  displayName?: string;
}) => {
  // Based on Sasha Trubetskoy's List of 20 Simple, Distinct Colors
  // https://sashamaps.net/docs/resources/20-colors/
  const palette = [
    ["#e6194B", "#ffffff"],
    ["#3cb44b", "#ffffff"],
    ["#ffe119", "#000000"],
    ["#4363d8", "#ffffff"],
    ["#f58231", "#ffffff"],
    ["#911eb4", "#ffffff"],
    ["#42d4f4", "#000000"],
    ["#f032e6", "#ffffff"],
    ["#bfef45", "#000000"],
    ["#fabed4", "#000000"],
    ["#469990", "#ffffff"],
    ["#dcbeff", "#000000"],
    ["#9A6324", "#ffffff"],
    ["#000000", "#ffffff"],
    ["#800000", "#ffffff"],
    ["#aaffc3", "#000000"],
    ["#808000", "#ffffff"],
    ["#ffd8b1", "#000000"],
    ["#000075", "#ffffff"],
    ["#a9a9a9", "#ffffff"],
  ];
  const initial = displayName
    ? displayName.trim().slice(0, 1).toUpperCase()
    : "?";
  const idSum = Array.from(_id ?? "").reduce(
    (t, c) => t + c.codePointAt(0)!,
    0,
  );
  const [circleColor, initialColor] =
    palette[Math.abs(idSum) % palette.length]!;
  const style = { backgroundColor: circleColor, color: initialColor };
  return <AvatarInitial style={style}>{initial}</AvatarInitial>;
};

const AvatarContainer = styled.div<{
  $size: number;
  $inline: boolean;
  $isSelf: boolean;
}>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  font-size: ${({ $size }) => 0.6 * $size}px;
  background-color: white;
  font-weight: 700;
  border-radius: 6px;
  overflow: hidden;
  vertical-align: middle;
  display: ${({ $inline }) => ($inline ? "inline-block" : "block")};
  box-shadow: ${({ $isSelf, theme }) =>
    $isSelf ? `0 0 4px ${theme.colors.avatarSelfShadow}` : "none"};
  border: ${({ $isSelf, theme }) =>
    $isSelf ? `0.5px solid ${theme.colors.avatarSelfBorder}` : "none"};
`;

const Avatar = React.memo(
  ({
    size,
    inline,
    _id,
    displayName,
    discordAccount,
    avatarUrl,
    googleProfilePicture,
    className,
    isSelf = false,
  }: {
    size: number;
    inline?: boolean;
    _id?: string; // hashed to produce a globally consistant background color for the fallback avatar
    displayName?: string;
    discordAccount?: DiscordAccountType;
    avatarUrl?: string;
    googleProfilePicture?: string;
    className?: string;
    isSelf?: boolean;
  }) => {
    const { t } = useTranslation();
    const [failedSource, setFailedSource] = useState<string>();
    const imageSource =
      avatarUrl ??
      (discordAccount
        ? getAvatarCdnUrl(discordAccount, size * 2)
        : undefined) ??
      googleProfilePicture;
    const content =
      imageSource && imageSource !== failedSource ? (
        <AvatarImg
          src={imageSource}
          alt={t("profile.avatar.alt", "Avatar")}
          onError={() => setFailedSource(imageSource)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <DefaultAvatarInner _id={_id} displayName={displayName} />
      );
    return (
      <AvatarContainer
        className={className}
        $size={size}
        $inline={inline ?? false}
        $isSelf={isSelf}
      >
        {content}
      </AvatarContainer>
    );
  },
);

export default Avatar;
