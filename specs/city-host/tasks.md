# OVERSTORY-CITYHOST — Implementation tasks

Governing spec: [spec.md](spec.md). Design: [plan.md](plan.md). Rows: [requirements.md](requirements.md).

Each task line reads `- [ ] T001 [P] [US1] <ID>-R012.4 description`. Tasks run producer first: a row's tasks follow the tasks of every row in its `Depends:` clause.

- [ ] T001 [US1] OVERSTORY-CITYHOST-R001 Implement and bind the test for The city route and its surface.
- [ ] T002 [US1] OVERSTORY-CITYHOST-R002 Implement and bind the test for The package is a dependency and the kit is fetched at build.
- [ ] T003 [US2] OVERSTORY-CITYHOST-R006 Implement and bind the test for The host gateway allowlists the package operations.
- [ ] T004 [US1] OVERSTORY-CITYHOST-R004 Implement and bind the test for The browser transport posts to the host gateway.
- [ ] T005 [US1] OVERSTORY-CITYHOST-R003 Implement and bind the test for The page mounts the engine with one call and disposes it.
- [ ] T006 [US1] OVERSTORY-CITYHOST-R001.1 Implement and bind the test for An explicit anonymous local sandbox mounts the labelled demo.
- [ ] T007 [US1] OVERSTORY-CITYHOST-R005 Implement and bind the test for The WebMCP tools dispatch through the engine handle.
- [ ] T008 [US2] OVERSTORY-CITYHOST-R006.1 Implement and bind the test for No credential or identity reaches the browser.
- [ ] T009 [US3] OVERSTORY-CITYHOST-R007.1 Implement and bind the test for The route manifest names the isolated routes.
- [ ] T010 [US3] OVERSTORY-CITYHOST-R007.2 Implement and bind the test for Only isolated documents get the isolation headers.
- [ ] T011 [US3] OVERSTORY-CITYHOST-R007.3 Implement and bind the test for Crossing the isolation boundary loads a new document.
- [ ] T012 [US3] OVERSTORY-CITYHOST-R007.4 Implement and bind the test for Browser proof: the city shares memory, and other pages are unchanged.
- [ ] T013 [US3] OVERSTORY-CITYHOST-R007 Prove the rollup through its child rows: The city page is cross-origin isolated, and no other page is (rollup).
- [ ] T014 [US4] OVERSTORY-CITYHOST-R008 Implement and bind the test for Hard cutover: the moved code and specs leave overstory.
