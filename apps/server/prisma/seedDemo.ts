/**
 * CLI wrapper around the demo data seed. The seed itself lives in
 * src/modules/admin/demoSeedService.ts, because it also runs inside the
 * server process (after listen, on boot) and behind the admin console's
 * one-shot re-run endpoint — see that file's header for the full story,
 * including how to remove demo data from a live environment.
 *
 *   npm run prisma:seed:demo                       seed a dev database
 *   npm run prisma:seed:demo -- --purge            remove the demo patient
 *   npm run prisma:seed:demo -- --allow-production hand-run against prod
 *
 * `--boot` is accepted for backwards compatibility with older start
 * commands; it behaves like the in-server boot trigger (a recorded no-op
 * unless SEED_DEMO_DATA=true).
 */
import 'dotenv/config';
import { prisma } from '../src/db/client.js';
import { runDemoSeed, purgeDemoSeed } from '../src/modules/admin/demoSeedService.js';

const args = process.argv.slice(2);

async function main() {
  if (args.includes('--purge')) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && !args.includes('--allow-production')) {
      console.log('NODE_ENV=production — pass --allow-production to purge demo data from a live database.');
      return;
    }
    const result = await purgeDemoSeed();
    console.log(result.detail);
    return;
  }

  const summary = await runDemoSeed({
    trigger: args.includes('--boot') ? 'boot' : 'cli',
    allowProduction: args.includes('--allow-production'),
  });

  console.log(`\n[seedDemo] ${summary.outcome}: ${summary.detail}`);
  if (summary.outcome === 'SUCCEEDED') {
    const email = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
    const password = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
    console.log(`Demo patient login: ${email} / ${password}`);
    console.log('(Login is email + password, then the emailed OTP — check the API logs for the code in dev.)');
  }
  // A hand-run failure should fail the command; a boot-mode failure must not
  // fail a start chain that still includes this wrapper.
  if (summary.outcome === 'FAILED' && !args.includes('--boot')) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
