import { useEffect, useState } from "react";
import { analysesApi } from "../api/client";

export const MOCK_TEXT =
  "Mock mode: chain data comes from offline sample fixtures and the AI steps use a deterministic offline mock model. No API keys are used.";

export function MockBanner() {
  const [mock, setMock] = useState(false);
  useEffect(() => {
    analysesApi
      .health()
      .then((h) => setMock(h.mockMode))
      .catch(() => setMock(false));
  }, []);
  if (!mock) return null;
  return (
    <div className="notice" role="status">
      {MOCK_TEXT}
    </div>
  );
}
