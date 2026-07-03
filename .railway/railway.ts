import { defineRailway, github, image, project, service } from "railway/iac";

export default defineRailway(() => {
  const pdf = service("ops-pdf", {
    source: image("macjamal/ops-pdf:latest"),
    start: "gotenberg --api-timeout=60s --libreoffice-restart-after=10",
  });

  const web = service("ops-web", {
    source: github("AustinSmith10/online-performance-solutions-v0", { branch: "main" }),
    build: "npm run build",
    start: "npm start",
    healthcheckPath: "/api/health",
    env: {
      GOTENBERG_URL: `http://${pdf.env.RAILWAY_PRIVATE_DOMAIN}:3000`,
    },
  });

  const worker = service("ops-worker", {
    source: github("AustinSmith10/online-performance-solutions-v0", { branch: "main" }),
    build: "npm run build",
    start: "npm run worker",
    env: {
      GOTENBERG_URL: `http://${pdf.env.RAILWAY_PRIVATE_DOMAIN}:3000`,
    },
  });

  return project("online-performance-solution-v0", {
    resources: [web, worker, pdf],
  });
});
