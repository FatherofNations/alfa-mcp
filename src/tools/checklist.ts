import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok } from "../lib/report.js";

/* get_checklist — короткие чек-листы стадий: выжимка из базы знаний для
   самопроверки агента перед сдачей этапа. Полные гайды — в resources. */

const CHECKLISTS: Record<string, { doc: string; items: string[] }> = {
  "import": {
    "doc": "alfa://knowledge/figma-import",
    "items": [
      "Complete design data and source version recorded; incomplete responses split by section.",
      "Actual Figma tool capabilities checked; assets downloaded using supported arguments.",
      "Fonts, variables, original assets and source IDs recorded.",
      "Authored motion fetched when available; missing behavior distinguished from static design."
    ]
  },
  "layout": {
    "doc": "alfa://knowledge/pixel-perfect",
    "items": [
      "Native JSX and stable semantic IDs; legacy HTML only in a bounded migration.",
      "Exact source fonts and loaded weights verified, or explicit substitution recorded.",
      "Source-derived geometry and native-size element comparison completed.",
      "Layout transforms separated from animated transforms; scoped effects have complete cleanup."
    ]
  },
  "animation": {
    "doc": "alfa://knowledge/animation-canon",
    "items": [
      "Motion contract identifies source, participants, tracks, timing, clipping and interruption.",
      "Exact Figma node/instance motion preserved when reproducing authored motion.",
      "No unintended glyph/image stretching or inferred shared-word identities.",
      "Intermediate frames and handoff boundaries checked against independent expectations.",
      "Real-time playback reviewed for rhythm, trajectory, legibility and end continuity.",
      "Rapid input, resize, slow assets, unmount and reduced motion exercised."
    ]
  },
  "qa": {
    "doc": "alfa://knowledge/verification",
    "items": [
      "Build/types/lint and applicable existing tests run; missing coverage listed separately.",
      "No broken required assets, browser errors or hydration failures.",
      "Real pointer and keyboard interaction tested in both directions; deep links and history checked.",
      "Static, functional and motion verdicts reported separately with reference provenance.",
      "CSS timing inspection is supplemented with actual animation output and playback."
    ]
  },
  "deploy": {
    "doc": "alfa://knowledge/deploy-vercel",
    "items": [
      "Deployment authorized; exact revision and required checks recorded.",
      "Existing deployment workflow and installed framework version inspected.",
      "Secrets and unrelated local files excluded.",
      "Delivered URL and revision verified; access protection preserved unless change is authorized."
    ]
  }
};

export function registerChecklist(server: McpServer) {
  server.registerTool(
    "get_checklist",
    {
      title: "Чек-лист стадии",
      description:
        "Короткий чек-лист для самопроверки перед сдачей стадии: import (выгрузка " +
        "из Figma), layout (вёрстка), animation (моушен), qa (parity-QA), deploy.",
      inputSchema: {
        stage: z.enum(["import", "layout", "animation", "qa", "deploy"]).describe("стадия работы"),
      },
    },
    async ({ stage }) => {
      const c = CHECKLISTS[stage];
      return ok([
        `# Чек-лист: ${stage} (полный гайд — ${c.doc})`,
        "",
        ...c.items.map((i) => `- [ ] ${i}`),
      ]);
    }
  );
}
