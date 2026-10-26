import { Meteor } from "meteor/meteor";
import { useTracker } from "meteor/react-meteor-data";
import { useState } from "react";
import Form from "react-bootstrap/Form";
import { useTranslation as useStudioTranslation } from "react-i18next";
import styled from "styled-components";
import Hunts from "../../lib/models/Hunts";
import huntsAll from "../../lib/publications/huntsAll";
import { useBreadcrumb } from "../hooks/breadcrumb";
import useTypedSubscribe from "../hooks/useTypedSubscribe";
import studioI18n from "../i18n";

const InfoPageOuter = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 24px 12px 48px;
  box-sizing: border-box;
`;

const InfoPageLayout = styled.div`
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 32px 48px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 5%);
  border-radius: 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
  font-size: 16px;
  font-family:
    "Microsoft YaHei", "PingFang SC", "Heiti SC", "WenQuanYi Micro Hei", Arial,
    sans-serif;
  color: #1f2a37;

  > * {
    width: 100%;
  }

  li {
    margin-top: 0.2rem;
  }

  @media (width <= 768px) {
    padding: 20px 18px 32px;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.8rem;
  font-weight: bold;
  margin-top: 1.5rem;
  border-top: 1px solid #ddd;
  padding-top: 1.5rem;
`;

const SubsectionTitle = styled.h3`
  font-size: 1.2rem;
  margin-top: 1.1rem;
  font-weight: bold;
`;

const SubsubsectionTitle = styled.h4`
  font-size: 1rem;
  margin-top: 1rem;
`;

const Illustration = styled.img`
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 30px rgb(15 23 42 / 8%);
  margin: 1rem auto 1.5rem;
`;

const InfoPage = () => {
  const { t } = useStudioTranslation();
  const [selectedHuntId, setSelectedHuntId] = useState("");
  const huntsLoading = useTypedSubscribe(huntsAll);
  const loading = huntsLoading();
  const hunts = useTracker(() => {
    const joinedHunts = Meteor.user()?.hunts ?? [];
    return Hunts.find(
      { _id: { $in: joinedHunts } },
      { sort: { name: 1 } },
    ).fetch();
  }, []);
  const hunt = hunts.find((h) => h._id === selectedHuntId);
  const bookmarklet = hunt
    ? `javascript:(function(){var u=encodeURIComponent(window.location.href);var t=encodeURIComponent(document.title);var o=${JSON.stringify(window.location.origin)};window.location.href=o+"/hunts/${hunt._id}/puzzleByUrl/"+u+"/"+t;})();`
    : undefined;

  useBreadcrumb({
    title: t("navigation.info", "Site guide"),
    path: "/info",
  });

  return (
    <InfoPageOuter>
      <InfoPageLayout>
        <h1 style={{ textAlign: "center", marginBottom: "0.5rem" }}>
          {t("navigation.info", "Site guide")}
        </h1>
        <p
          style={{
            textAlign: "center",
            color: "#6b7280",
            marginBottom: "1.5rem",
          }}
        >
          {studioI18n.t("studio.messages.m120")}
        </p>
        <SectionTitle>{studioI18n.t("studio.messages.m121")}</SectionTitle>
        {studioI18n.t("studio.messages.m122")}
        <SubsectionTitle>
          {studioI18n.t("studio.messages.m123")}
        </SubsectionTitle>
        {studioI18n.t("studio.messages.m124")}
        <SubsectionTitle>
          {studioI18n.t("studio.messages.m125")}
        </SubsectionTitle>
        <Form.Group controlId="bookmarklet-hunt" className="mb-3">
          <Form.Label>
            {t("studio.guide.bookmarkHunt", "Bookmarklet hunt")}
          </Form.Label>
          <Form.Select
            style={{ maxWidth: 360 }}
            value={hunt?._id ?? ""}
            disabled={loading || hunts.length === 0}
            onChange={(event) => setSelectedHuntId(event.target.value)}
          >
            <option value="">
              {t("studio.guide.chooseHunt", "Choose a hunt")}
            </option>
            {hunts.map((h) => (
              <option key={h._id} value={h._id}>
                {h.name}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
        {hunt ? (
          <p>
            <a
              href="#bookmarklet-hunt"
              ref={(link) => {
                // Preserve the executable bookmarklet URL when dragged to the bookmarks bar.
                if (link && bookmarklet) link.setAttribute("href", bookmarklet);
              }}
              onClick={(event) => event.preventDefault()}
            >
              JollyMeow
            </a>{" "}
            {studioI18n.t("studio.messages.m126")}
          </p>
        ) : (
          <p className="text-muted">
            {t(
              "studio.guide.bookmarkHelp",
              "Choose a hunt you have joined to generate its bookmarklet. The site guide is available even if you have not joined a hunt.",
            )}
          </p>
        )}
        <SectionTitle>{studioI18n.t("studio.messages.m127")}</SectionTitle>
        <SubsectionTitle>
          {studioI18n.t("studio.messages.m128")}
        </SubsectionTitle>
        {studioI18n.t("studio.messages.m129")}
        <Illustration
          src="/images/puzzlePage.png"
          alt={studioI18n.t("studio.messages.m130")}
        />
        <ol>
          <li>{studioI18n.t("studio.messages.m131")}</li>
          {hunt?.hasChat !== false && (
            <li>
              {studioI18n.t("studio.messages.m132")}
              <ul>
                <li>{studioI18n.t("studio.messages.m133")}</li>
              </ul>
            </li>
          )}
          {hunt?.hasChat !== false && (
            <li>
              {studioI18n.t("studio.messages.m134")}
              <ul>
                <li>{studioI18n.t("studio.messages.m135")}</li>
              </ul>
            </li>
          )}
          <li>
            {studioI18n.t("studio.messages.m136")}
            <a href="#tags">{studioI18n.t("studio.messages.m137")}</a>）
            <ul>
              <li>{studioI18n.t("studio.messages.m138")}</li>
            </ul>
          </li>
          <li>{studioI18n.t("studio.messages.m139")}</li>
          {hunt?.hasHints !== false && (
            <li>
              {studioI18n.t("studio.messages.m140")}
              <b>{studioI18n.t("studio.messages.m141")}</b>
              {studioI18n.t("studio.messages.m142")}
              <b>{studioI18n.t("studio.messages.m143")}</b>
              {studioI18n.t("studio.messages.m144")}
              <ul>
                <li>{studioI18n.t("studio.messages.m145")}</li>
              </ul>
              <ul>
                <li>{studioI18n.t("studio.messages.m146")}</li>
              </ul>
              <ul>
                <li>{studioI18n.t("studio.messages.m147")}</li>
              </ul>
              <ul>
                <li>{studioI18n.t("studio.messages.m148")}</li>
              </ul>
            </li>
          )}
          <li>
            {hunt?.hasGuessQueue !== false
              ? studioI18n.t("studio.messages.m149")
              : studioI18n.t("studio.messages.m150")}
            {studioI18n.t("studio.messages.m151")}
          </li>
        </ol>
        <SubsectionTitle id="tags">
          {studioI18n.t("studio.messages.m137")}
        </SubsectionTitle>
        {studioI18n.t("studio.messages.m152")}
        <SubsubsectionTitle>
          {studioI18n.t("studio.messages.m153")}
        </SubsubsectionTitle>
        <ul>
          <li>
            {studioI18n.t("studio.messages.m154")} <b>group:roundName</b>
            {studioI18n.t("studio.messages.m155")}
            <ul>
              <li>{studioI18n.t("studio.messages.m156")}</li>
            </ul>
          </li>
          <li>
            {studioI18n.t("studio.messages.m157")}
            <b>is:meta</b> {studioI18n.t("studio.messages.m158")}
            <b>meta-for:roundName</b> {studioI18n.t("studio.messages.m159")}
          </li>
        </ul>
        <SubsubsectionTitle>
          {studioI18n.t("studio.messages.m160")}
        </SubsubsectionTitle>
        <div>
          {studioI18n.t("studio.messages.m161")}
          <b>priority:high</b> {studioI18n.t("studio.messages.m158")}
          <b>priority:low</b>
          {studioI18n.t("studio.messages.m162")}
        </div>
        <SubsubsectionTitle>
          {studioI18n.t("studio.messages.m163")}
        </SubsubsectionTitle>
        {studioI18n.t("studio.messages.m164")}
        <div>
          <ul>
            <li>
              <b>needs:aha</b> {studioI18n.t("studio.messages.m165")}
            </li>
            <li>
              <b>needs:extraction</b> {studioI18n.t("studio.messages.m166")}
            </li>
            <li>
              <b>wait:interaction</b> {studioI18n.t("studio.messages.m167")}
            </li>
          </ul>
        </div>
        <SubsubsectionTitle>
          {studioI18n.t("studio.messages.m168")}
        </SubsubsectionTitle>
        {studioI18n.t("studio.messages.m169")}
        <div>
          <ul>
            <li>
              <b>onsite</b> {studioI18n.t("studio.messages.m170")}
            </li>
            <li>
              <b>event</b> {studioI18n.t("studio.messages.m171")}
            </li>
            <li>
              <b>printer</b> {studioI18n.t("studio.messages.m172")}
            </li>
            <li>
              <b>scavenger</b> {studioI18n.t("studio.messages.m173")}
            </li>
          </ul>
        </div>
        <SubsubsectionTitle>
          {studioI18n.t("studio.messages.m174")}
        </SubsubsectionTitle>
        <div>
          {studioI18n.t("studio.messages.m175")}
          <b>{studioI18n.t("studio.messages.m176")}</b>
          {studioI18n.t("studio.messages.m177")}
        </div>
      </InfoPageLayout>
    </InfoPageOuter>
  );
};

export default InfoPage;
