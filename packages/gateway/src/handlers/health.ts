/**
 * Health check endpoint
 */
export const handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Startup Researcher Gateway",
      version: "0.2.0",
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  };
};
