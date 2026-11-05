import { expect, test } from './consumer-page.ts';

test.setTimeout(120_000);

test('should consume live targeting and typed configuration', async ({ consumer, demo }) => {
  await test.step('Introduce the standalone consumer boundary', async () => {
    await demo.chapter(
      'Flightdeck → a real OpenFeature consumer',
      'This local lab uses synthetic people, memberships and briefs. It is not BC sign-in, a directory connection or a deployed environment.'
    );
    await demo.caption(
      'LIVE · The browser selects a known synthetic person. The consumer backend supplies identity and memberships; Flightdeck evaluates persisted configuration.'
    );
    await demo.point(consumer.person);
    await demo.pause();
  });

  await test.step('Enable the title filter for the Alpha pilot', async () => {
    await demo.caption(
      'LIVE · Mira belongs to Alpha pilot group 501. A real true decision enables the title filter; typing Alpha narrows the three synthetic briefs to one.'
    );
    await consumer.evaluate();
    await consumer.expectLiveDecision(true, 'bc-homepage-title-filter', 'rule');
    await consumer.expectMemberships('00000000-0000-4000-8000-000000000101', ['101'], ['501']);
    await consumer.expectAllBriefs();
    await expect(consumer.titleFilter).toBeVisible();
    await demo.fill(consumer.titleFilter, 'Alpha');
    await expect(consumer.briefs).toHaveText(['Alpha readiness brief']);
    await demo.pause(3000);
  });

  await test.step('Preserve the full brief list for the standard member', async () => {
    await demo.caption(
      'LIVE · Kai is a standard member, not an Alpha pilot. This is a successful false decision—not a fallback. No title filter appears; all three briefs remain.'
    );
    await consumer.choosePerson('standard');
    await consumer.evaluate();
    await consumer.expectLiveDecision(false, 'bc-homepage-title-filter', 'default');
    await consumer.expectMemberships('00000000-0000-4000-8000-000000000102', ['102'], ['502']);
    await expect(consumer.titleFilter).toHaveCount(0);
    await consumer.expectAllBriefs();
    await demo.point(consumer.value);
    await demo.pause(3000);
  });

  await test.step('Evaluate effective membership lists without a current organization', async () => {
    await demo.caption(
      'LIVE · Rowan has organizations 101 and 102, and groups 502 and 501. Membership in Alpha pilot group 501 still enables filtering. No current organization is inferred.'
    );
    await consumer.choosePerson('multi');
    await consumer.evaluate();
    await consumer.expectLiveDecision(true, 'bc-homepage-title-filter', 'rule');
    await consumer.expectMemberships(
      '00000000-0000-4000-8000-000000000103',
      ['101', '102'],
      ['502', '501']
    );
    await expect(consumer.titleFilter).toBeVisible();
    await consumer.expectAllBriefs();
    await demo.point(consumer.context);
    await demo.pause(3000);
  });

  await test.step('Consume a live string through OpenFeature', async () => {
    await demo.caption(
      'LIVE · Configuration is typed, not only Boolean. The string detail API returns the managed welcome message with a real revision and no error.'
    );
    await consumer.chooseCapability('demo-greeting');
    await consumer.evaluate();
    await consumer.expectLiveDecision('Welcome from Flightdeck', 'demo-greeting', 'default');
    await demo.point(consumer.value);
    await demo.pause(3000);
  });

  await test.step('Consume a live number through OpenFeature', async () => {
    await demo.caption(
      'LIVE · The numeric page limit is 12, not a string and not the caller default of 5. Each Evaluate click asks the backend for a fresh decision.'
    );
    await consumer.chooseCapability('demo-page-limit');
    await consumer.evaluate();
    await consumer.expectLiveDecision(12, 'demo-page-limit', 'default');
    await demo.point(consumer.value);
    await demo.pause(3000);
  });

  await test.step('Consume a live JSON object through OpenFeature', async () => {
    await demo.caption(
      'LIVE · The object detail API preserves structured configuration: compact density and showSummary true. This is configuration consumption, not an experiment exposure or result.'
    );
    await consumer.chooseCapability('demo-layout');
    await consumer.evaluate();
    await consumer.expectLiveDecision(
      { density: 'compact', showSummary: true },
      'demo-layout',
      'default'
    );
    await demo.point(consumer.value);
    await demo.pause(3000);
    await demo.clearCaption();
  });
});

test('should distinguish simulated fallback from live tenant denial and recovery', async ({
  consumer,
  demo,
}) => {
  await test.step('Establish the real live decision before failures', async () => {
    await demo.chapter(
      'Recovery policy without hiding authorization failures',
      'Two transport failures are explicitly simulated. Tenant denial calls real Flightdeck. The lab does not stop the service, revoke credentials or change managed configuration.'
    );
    await demo.caption(
      'LIVE BASELINE · Synthetic Alpha pilot Mira receives true from Flightdeck. The title filter is available before any failure scenario.'
    );
    await consumer.evaluate();
    await consumer.expectLiveDecision(true, 'bc-homepage-title-filter', 'rule');
    await expect(consumer.titleFilter).toBeVisible();
    await consumer.expectAllBriefs();
    await demo.pause(3000);
  });

  await test.step('Apply the declared default for simulated service unavailability', async () => {
    await demo.caption(
      'SIMULATED TRANSPORT · A local fixture returns HTTP 503; Flightdeck itself is not down. The caller chooses false, with ERROR / GENERAL and source fallback—not a successful service decision.'
    );
    await consumer.chooseScenario('unavailable');
    await consumer.evaluate();
    await consumer.expectFallback('unavailable');
    await demo.point(consumer.metadata);
    await demo.pause(3000);
  });

  await test.step('Distinguish simulated malformed data from an unavailable service', async () => {
    await demo.caption(
      'SIMULATED TRANSPORT · A local fixture returns malformed decision data. The caller default remains false, but PARSE_ERROR / invalid-response identifies why. No service revision is invented.'
    );
    await consumer.chooseScenario('malformed');
    await consumer.evaluate();
    await consumer.expectFallback('invalid-response');
    await demo.point(consumer.errorCode);
    await demo.pause(3000);
  });

  await test.step('Reject a denied tenant through the real Flightdeck service', async () => {
    await demo.caption(
      'LIVE AUTHORIZATION FAILURE · The backend sends a tenant outside its credential grant to real Flightdeck. The consumer returns HTTP 502 and an explicit error—no false decision or accepted fallback.'
    );
    await consumer.chooseScenario('wrong-tenant');
    await consumer.evaluate(502);
    await demo.point(consumer.authorizationError);
    await demo.pause(3000);
  });

  await test.step('Recover by evaluating live with the authorized tenant again', async () => {
    await demo.caption(
      'LIVE RECOVERY · Returning to the authorized live scenario makes a fresh request. Flightdeck again returns true with a revision and no error; Alpha filtering works again. No cache or retry is implied.'
    );
    await consumer.chooseScenario('live');
    await consumer.evaluate();
    await consumer.expectLiveDecision(true, 'bc-homepage-title-filter', 'rule');
    await consumer.expectMemberships('00000000-0000-4000-8000-000000000101', ['101'], ['501']);
    await expect(consumer.titleFilter).toBeVisible();
    await demo.fill(consumer.titleFilter, 'Alpha');
    await expect(consumer.briefs).toHaveText(['Alpha readiness brief']);
    await demo.pause(3000);
    await demo.clearCaption();
  });
});
