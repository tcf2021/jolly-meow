import styled from "styled-components";

export const ManagementPage = styled.div`
  max-width: 1120px;
  margin: 0 auto;
  padding: 32px 8px 48px;
  color: var(--bs-body-color);
  @media (max-width: 767px) { padding: 20px 0 32px; }
`;

export const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
  h1 { font-size: 26px; font-weight: 600; margin: 0; }
  p { color: var(--bs-secondary-color); margin: 8px 0 0; }
  @media (max-width: 767px) { flex-wrap: wrap; margin-bottom: 20px; }
`;

export const ManagementCard = styled.section`
  border: 1px solid var(--bs-border-color);
  border-radius: 10px;
  background: var(--bs-body-bg);
  padding: 24px;
  margin-bottom: 24px;
  min-width: 0;
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 20px; }
  h3 { font-size: 16px; font-weight: 600; }
  .form-label { font-weight: 500; margin-bottom: 8px; }
  .form-text { color: var(--bs-secondary-color); font-size: 13px; line-height: 1.6; }
  @media (max-width: 767px) { padding: 16px; }
`;

export const EmptyState = styled.div`
  padding: 40px 24px;
  text-align: center;
  color: var(--bs-secondary-color);
  h3 { font-size: 15px; color: var(--bs-secondary-color); margin: 0 0 8px; }
  p { margin: 0; font-size: 13px; }
`;

export const QueueToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--bs-border-color);
  .mb-3 { flex: 1; max-width: 480px; margin-bottom: 0 !important; }
  > span { color: var(--bs-secondary-color); white-space: nowrap; font-size: 13px; }
  @media (max-width: 767px) { align-items: start; padding: 16px; flex-wrap: wrap; }
`;

export const QueueContent = styled.div`
  overflow-x: auto;
  border-radius: 0 0 10px 10px;
  @media (max-width: 767px) { padding: 0 12px; }
`;

export const CollapsibleSettings = styled.details`
  border: 1px solid var(--bs-border-color);
  border-radius: 10px;
  padding: 20px 24px;
  margin-bottom: 24px;
  summary { cursor: pointer; font-size: 16px; font-weight: 600; }
  &[open] summary { margin-bottom: 24px; }
  @media (max-width: 767px) { padding: 16px; }
`;
