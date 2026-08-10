function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  accessTokenTtl: "15m",
  refreshTokenTtlDays: 7,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  hrEncryptionKey: process.env.HR_ENCRYPTION_KEY || "dev_hr_encryption_key_change_me",
};
