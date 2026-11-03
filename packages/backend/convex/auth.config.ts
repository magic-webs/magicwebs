// Convex validates the JWTs Convex Auth issues against this deployment's own
// site URL. Without this file every request is silently signed out.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
}
