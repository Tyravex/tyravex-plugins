import { useState } from "react";
import type { SupportGrant, SupportScope } from "@shared/types";
import { supportCenterApi } from "../api/supportCenterApi";
import { useSupportTranslation } from "../lib/useSupportTranslation";
import { supportError } from "../lib/supportError";
import {
  decodeText,
  encodeText,
} from "@/features/services/workspace/api/workspaceApi";

export function SupportWorkspacePanel({
  ticketId,
  grant,
  preview,
}: {
  ticketId: string;
  grant: SupportGrant;
  preview: boolean;
}) {
  const { t } = useSupportTranslation();
  const [path, setPath] = useState("/");
  const [content, setContent] = useState("");
  const [revision, setRevision] = useState<{
    path: string;
    hash: string;
  } | null>(null);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const command = async (operation: string) => {
    setBusy(true);
    setError("");
    setResult("");
    try {
      const args =
        operation === "runtime.status"
          ? {}
          : operation === "files.write"
            ? {
                path,
                contentBase64: encodeText(content),
                expectedHash: revision?.hash,
              }
            : { path };
      const data = await supportCenterApi.workspace(ticketId, {
        grantId: grant.id,
        operation,
        args,
      });
      if (operation === "files.read") {
        setContent(decodeText(String(data.contentBase64)));
        setRevision({ path, hash: String(data.sha256) });
        setResult(t("operationDone"));
      } else if (operation === "files.write") {
        setRevision(null);
        setResult(t("operationDone"));
      } else setResult(JSON.stringify(data, null, 2));
    } catch (reason) {
      setError(supportError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-primary/30 p-4">
      <h3 className="font-semibold">{t("workspace")}</h3>
      <p className="text-sm text-text-secondary">
        {t(preview ? "previewWorkspace" : "workspaceHelp")}
      </p>
      {!preview && (
        <>
          <label className="block space-y-2 text-sm">
            <span>{t("path")}</span>
            <input
              className="w-full rounded-xl border border-border-subtle bg-background p-3"
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                setRevision(null);
                setContent("");
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              ["runtime.status", "runtime", "status"],
              ["files.list", "listFiles", "files:read"],
              ["files.read", "readFile", "files:read"],
            ]
              .filter(([, , scope]) =>
                grant.scopes.includes(scope as SupportScope),
              )
              .map(([operation, key]) => (
                <button
                  key={operation}
                  disabled={busy}
                  onClick={() => void command(operation)}
                  className="rounded-lg border border-border-subtle px-3 py-2 text-sm"
                >
                  {t(key)}
                </button>
              ))}
          </div>
          {revision && (
            <>
              <textarea
                aria-label={t("message")}
                className="min-h-64 w-full rounded-xl border border-border-subtle bg-background p-3 font-mono text-xs"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                readOnly={!grant.scopes.includes("files:write")}
              />
              {grant.scopes.includes("files:write") && (
                <button
                  disabled={busy || revision.path !== path}
                  onClick={() => void command("files.write")}
                  className="rounded-lg bg-primary px-3 py-2 text-sm text-white"
                >
                  {t("saveFile")}
                </button>
              )}
            </>
          )}
          {busy && <p role="status">{t("loading")}</p>}
          {error && (
            <p role="alert" className="text-rose-300">
              {t(error, { defaultValue: t("error") })}
            </p>
          )}
          {result && (
            <div>
              <h4 className="mb-2 text-sm">{t("result")}</h4>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-background p-3 text-xs">
                {result}
              </pre>
            </div>
          )}
        </>
      )}
    </section>
  );
}
