import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { useBreadcrumb } from "../hooks/breadcrumb";

const HuntListApp = () => {
  const { t } = useTranslation();
  useBreadcrumb({
    title: t("navigation.home", "Home"),
    path: "/hunts",
  });
  return <Outlet />;
};

export default HuntListApp;
