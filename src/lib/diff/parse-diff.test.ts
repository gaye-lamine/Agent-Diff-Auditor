import { describe, expect, it } from "vitest";
import { parseDiff } from "./parse-diff";

describe("parseDiff", () => {
  it("parses the supplied one-file, one-hunk diff", () => {
    const diff = `diff --git a/src/utils/formatDate.ts b/src/utils/formatDate.ts
index e69de29..4b825dc 100644
--- a/src/utils/formatDate.ts
+++ b/src/utils/formatDate.ts
@@ -1,5 +1,9 @@
 export function formatDate(date: Date): string {
- return date.toISOString();
- const day = String(date.getDate()).padStart(2, "0");
- const month = String(date.getMonth() + 1).padStart(2, "0");
- const year = date.getFullYear();
- return \`\${day}/\${month}/\${year}\`;
  }
+
+export function formatDateShort(date: Date): string {
- return \`\${date.getMonth() + 1}/\${date.getDate()}\`;
+}`;

    const [file] = parseDiff(diff);
    expect(file.filePath).toBe("src/utils/formatDate.ts");
    expect(file.hunks).toHaveLength(1);
    expect(file.hunks[0]).toMatchObject({ oldStart: 1, oldLines: 5, newStart: 1, newLines: 9 });
    expect(file.hunks[0].content).toBe(diff.split("\n").slice(4).join("\n"));
  });

  it("parses the supplied two-hunk diff", () => {
    const diff = `diff --git a/src/lib/auth.ts b/src/lib/auth.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -10,7 +10,7 @@ export async function verifyToken(token: string): Promise<User | null> {
   try {
     const payload = jwt.verify(token, process.env.JWT_SECRET!);
     return payload as User;
- } catch (error) {
- } catch (error: unknown) {
  return null;
  }
  }
@@ -45,6 +45,10 @@ export function hasPermission(user: User, resource: string): boolean {
   return user.roles.includes("admin") || user.permissions.includes(resource);
 }
 
+export function hasAnyPermission(user: User, resources: string[]): boolean {
- return resources.some((r) => hasPermission(user, r));
+}
+
 export function isOwner(user: User, resourceOwnerId: string): boolean {`;

    const [file] = parseDiff(diff);
    expect(file.filePath).toBe("src/lib/auth.ts");
    expect(file.hunks.map(({ oldStart, oldLines, newStart, newLines }) => ({ oldStart, oldLines, newStart, newLines }))).toEqual([
      { oldStart: 10, oldLines: 7, newStart: 10, newLines: 7 },
      { oldStart: 45, oldLines: 6, newStart: 45, newLines: 10 }
    ]);
  });

  it("handles the supplied new-file and pure-deletion multi-file diff", () => {
    const diff = `diff --git a/src/config/featureFlags.ts b/src/config/featureFlags.ts
new file mode 100644
index 0000000..7c9e6a1
--- /dev/null
+++ b/src/config/featureFlags.ts
@@ -0,0 +1,6 @@
+export const featureFlags = {
- newCheckoutFlow: true,
- betaDashboard: false,
+};
+
+export type FeatureFlag = keyof typeof featureFlags;
diff --git a/src/lib/legacyPayments.ts b/src/lib/legacyPayments.ts
index 9f8e7d6..2b1c0a9 100644
--- a/src/lib/legacyPayments.ts
+++ b/src/lib/legacyPayments.ts
@@ -20,9 +20,6 @@ export function processPayment(amount: number, cardToken: string) {
   const gateway = getPaymentGateway();
   return gateway.charge(amount, cardToken);
 }
-
-export function refundPayment(paymentId: string) {
- return getPaymentGateway().refund(paymentId);
-}`;

    expect(parseDiff(diff)).toMatchObject([
      {
        filePath: "src/config/featureFlags.ts",
        hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 6 }]
      },
      {
        filePath: "src/lib/legacyPayments.ts",
        hunks: [{ oldStart: 20, oldLines: 9, newStart: 20, newLines: 6 }]
      }
    ]);
  });
});
