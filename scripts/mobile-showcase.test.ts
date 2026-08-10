import { assert, it } from "@effect/vitest";
import { PNG } from "pngjs";

import showcaseConfig, {
  resolveShowcaseAndroidAbi,
  type ShowcaseConfig,
  type ShowcaseStoreAssetSpec,
} from "./mobile-showcase.config.ts";
import {
  SHOWCASE_ENVIRONMENTS,
  SHOWCASE_PROJECTS,
  SHOWCASE_THREADS,
} from "./mobile-showcase-environment.ts";
import {
  encodeAndroidPairingUrls,
  normalizeStorePng,
  newTaskComposerControlFailures,
  parseShowcaseCliArgs,
  parseAndroidUiNodes,
  parseVisibleAndroidImeTop,
  parsePairingCredentialOutput,
  planShowcaseCaptures,
  readPngDimensions,
  readPngMetadata,
  resolveAndroidSdkRoot,
  selectLanIpv4Address,
  showcaseCaptureDirectory,
  showcaseSceneUrl,
  threadComposerFooterRecoveryFailure,
  threadComposerKeyboardOpenFailure,
  validateStoreAsset,
  validateStoreAssetCount,
} from "./mobile-showcase.ts";

const appleSpec: ShowcaseStoreAssetSpec = {
  store: "apple",
  directory: "apple/iphone-test",
  width: 1284,
  height: 2778,
  minimumUploadCount: 1,
  maximumUploadCount: 10,
};

const googleSpec: ShowcaseStoreAssetSpec = {
  store: "google-play",
  directory: "google-play/phone",
  width: 1080,
  height: 1920,
  minimumUploadCount: 2,
  maximumUploadCount: 8,
  maximumFileSizeBytes: 8 * 1024 * 1024,
};

const config: ShowcaseConfig = {
  outputDirectory: "artifacts",
  metroPort: 8199,
  settleDelayMs: 1,
  devices: [
    {
      id: "phone",
      platform: "ios",
      simulator: "iPhone Test",
      appearance: "dark",
      scenes: ["thread", "review"],
      storeAsset: appleSpec,
    },
    {
      id: "pixel",
      platform: "android",
      avd: "Pixel_Test",
      appearance: "light",
      scenes: ["thread", "terminal"],
      testScenes: ["new-task-keyboard", "thread-keyboard-dismiss"],
      storeAsset: googleSpec,
    },
  ],
};

it("parses repeatable capture filters", () => {
  const options = parseShowcaseCliArgs([
    "--platform",
    "ios",
    "--device",
    "phone",
    "--scene",
    "review",
    "--appearance",
    "both",
    "--skip-build",
  ]);
  assert.deepStrictEqual([...options.platforms], ["ios"]);
  assert.deepStrictEqual([...options.deviceIds], ["phone"]);
  assert.deepStrictEqual([...options.scenes], ["review"]);
  assert.deepStrictEqual([...options.appearances], ["light", "dark"]);
  assert.equal(options.skipBuild, true);
});

it("rejects unsupported system appearances", () => {
  assert.throws(
    () => parseShowcaseCliArgs(["--appearance", "sepia"]),
    /Unsupported appearance 'sepia'/u,
  );
});

it("parses validation-only mode", () => {
  assert.equal(parseShowcaseCliArgs(["--validate-only"]).validateOnly, true);
});

it("selects an explicit CI Android ABI without changing the local default", () => {
  assert.equal(resolveShowcaseAndroidAbi(undefined), "arm64-v8a");
  assert.equal(resolveShowcaseAndroidAbi("x86_64"), "x86_64");
  assert.throws(() => resolveShowcaseAndroidAbi("mips"), /Unsupported T3_SHOWCASE_ANDROID_ABI/u);
});

it("uses platform-correct default Android SDK roots", () => {
  assert.equal(
    resolveAndroidSdkRoot({ HOME: "/Users/showcase" }, "darwin"),
    "/Users/showcase/Library/Android/sdk",
  );
  assert.equal(
    resolveAndroidSdkRoot({ HOME: "/home/showcase" }, "linux"),
    "/home/showcase/Android/Sdk",
  );
  assert.equal(
    resolveAndroidSdkRoot(
      { HOME: "/home/showcase", ANDROID_SDK_ROOT: "/opt/android-sdk" },
      "linux",
    ),
    "/opt/android-sdk",
  );
});

it("plans only scenes supported by each selected device", () => {
  const options = parseShowcaseCliArgs(["--platform", "all", "--scene", "terminal"]);
  const captures = planShowcaseCaptures(config, options);
  assert.deepStrictEqual(
    captures.map((capture) => ({
      id: capture.device.id,
      appearance: capture.appearance,
      scenes: capture.scenes,
    })),
    [{ id: "pixel", appearance: "light", scenes: ["terminal"] }],
  );
});

it("keeps regression-only scenes out of default store captures", () => {
  const captures = planShowcaseCaptures(config, parseShowcaseCliArgs(["--device", "pixel"]));
  assert.deepStrictEqual(captures[0]?.scenes, ["thread", "terminal"]);
});

it("selects an explicit Android keyboard regression scene", () => {
  const captures = planShowcaseCaptures(
    config,
    parseShowcaseCliArgs(["--device", "pixel", "--scene", "new-task-keyboard"]),
  );
  assert.deepStrictEqual(captures[0]?.scenes, ["new-task-keyboard"]);
});

it("selects the thread composer keyboard-dismiss regression scene", () => {
  const captures = planShowcaseCaptures(
    config,
    parseShowcaseCliArgs(["--device", "pixel", "--scene", "thread-keyboard-dismiss"]),
  );
  assert.deepStrictEqual(captures[0]?.scenes, ["thread-keyboard-dismiss"]);
});

it("expands both appearances into independent upload-ready directories", () => {
  const options = parseShowcaseCliArgs(["--device", "phone", "--appearance", "both"]);
  const captures = planShowcaseCaptures(config, options);

  assert.deepStrictEqual(
    captures.map((capture) => ({
      appearance: capture.appearance,
      directory: showcaseCaptureDirectory("/captures", capture),
    })),
    [
      { appearance: "light", directory: "/captures/apple/iphone-test/light" },
      { appearance: "dark", directory: "/captures/apple/iphone-test/dark" },
    ],
  );
});

it("rejects unknown devices instead of silently capturing another target", () => {
  const options = parseShowcaseCliArgs(["--device", "missing"]);
  assert.throws(() => planShowcaseCaptures(config, options), /Unknown device 'missing'/u);
});

it("reads captured PNG dimensions from the IHDR header", () => {
  const bytes = new Uint8Array(26);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, 1320);
  view.setUint32(20, 2868);
  view.setUint8(24, 8);
  view.setUint8(25, 2);
  assert.deepStrictEqual(readPngDimensions(bytes), {
    width: 1320,
    height: 2868,
  });
  assert.deepStrictEqual(readPngMetadata(bytes), {
    width: 1320,
    height: 2868,
    bitDepth: 8,
    colorType: 2,
    hasAlpha: false,
  });
});

function rgbaPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(255);
  return PNG.sync.write(png);
}

it("converts simulator RGBA captures to upload-safe 24-bit RGB PNGs", () => {
  const normalized = normalizeStorePng(rgbaPng(2, 3));
  assert.deepStrictEqual(readPngMetadata(normalized), {
    width: 2,
    height: 3,
    bitDepth: 8,
    colorType: 2,
    hasAlpha: false,
  });
});

it("validates exact Apple and Google Play upload assets", () => {
  const apple = normalizeStorePng(rgbaPng(appleSpec.width, appleSpec.height));
  const google = normalizeStorePng(rgbaPng(googleSpec.width, googleSpec.height));
  assert.equal(validateStoreAsset(appleSpec, apple).width, 1284);
  assert.equal(validateStoreAsset(googleSpec, google).height, 1920);
});

it("rejects wrong dimensions and alpha-bearing PNGs", () => {
  const wrongSize = normalizeStorePng(rgbaPng(1242, 2688));
  assert.throws(() => validateStoreAsset(appleSpec, wrongSize), /requires 1284×2778/u);
  assert.throws(() => validateStoreAsset(appleSpec, rgbaPng(1284, 2778)), /without alpha/u);
});

it("enforces store screenshot count limits", () => {
  assert.doesNotThrow(() => validateStoreAssetCount(googleSpec, 5, true));
  assert.throws(() => validateStoreAssetCount(googleSpec, 1, true), /requires at least 2/u);
  assert.throws(() => validateStoreAssetCount(googleSpec, 9, false), /allows at most 8/u);
});

it("configures every default device with an exact upload-ready store target", () => {
  assert.deepStrictEqual(
    showcaseConfig.devices.map((device) => [
      device.id,
      device.platform === "ios" ? (device.orientation ?? "portrait") : null,
      device.storeAsset.directory,
      device.storeAsset.width,
      device.storeAsset.height,
    ]),
    [
      ["iphone-6.9", "portrait", "apple/iphone-6.9", 1320, 2868],
      ["iphone-6.5", "portrait", "apple/iphone-6.5", 1284, 2778],
      ["ipad-13", "landscape", "apple/ipad-13", 2752, 2064],
      ["pixel", null, "google-play/phone", 1080, 1920],
      ["android-tablet-7", null, "google-play/tablet-7", 1080, 1920],
      ["android-tablet-10", null, "google-play/tablet-10", 1440, 2560],
    ],
  );
});

it("selects a reachable LAN IPv4 address", () => {
  assert.equal(
    selectLanIpv4Address([
      { address: "127.0.0.1", family: "IPv4", internal: true },
      { address: "fe80::1", family: "IPv6", internal: false },
      { address: "169.254.2.4", family: "IPv4", internal: false },
      { address: "192.168.1.80", family: "IPv4", internal: false },
    ]),
    "192.168.1.80",
  );
});

it("maps capture scenes to the real application routes", () => {
  assert.equal(showcaseSceneUrl("threads", "environment-1"), "t3code://");
  assert.equal(showcaseSceneUrl("environments", "environment-1"), "t3code://settings/environments");
  assert.equal(
    showcaseSceneUrl("thread", "environment-1"),
    "t3code://threads/environment-1/remote-command-center",
  );
  assert.equal(
    showcaseSceneUrl("terminal", "environment-1"),
    "t3code://threads/environment-1/remote-command-center/terminal?terminalId=term-1",
  );
  assert.equal(
    showcaseSceneUrl("review", "environment-1"),
    "t3code://threads/environment-1/remote-command-center/review",
  );
  assert.equal(showcaseSceneUrl("new-task-keyboard", "environment-1"), "t3code://new/draft");
  assert.equal(
    showcaseSceneUrl("thread-keyboard-dismiss", "environment-1"),
    "t3code://threads/environment-1/remote-command-center",
  );
});

it("parses Android accessibility bounds used by the keyboard regression", () => {
  const [node] = parseAndroidUiNodes(`<?xml version="1.0"?><hierarchy>
    <node text="" content-desc="Thread settings &amp; model" class="android.view.View"
      enabled="true" resource-id="thread-composer-sticky-view" visible-to-user="true"
      bounds="[12,840][420,900]" />
  </hierarchy>`);
  assert.deepStrictEqual(node, {
    className: "android.view.View",
    contentDescription: "Thread settings & model",
    enabled: true,
    resourceId: "thread-composer-sticky-view",
    text: "",
    visibleToUser: true,
    bounds: { left: 12, top: 840, right: 420, bottom: 900 },
  });
});

it("treats Android 11 accessibility nodes without visibility metadata as visible", () => {
  const [node] = parseAndroidUiNodes(`<hierarchy>
    <node class="android.widget.EditText" enabled="true" bounds="[12,840][420,900]" />
  </hierarchy>`);

  assert.equal(node?.visibleToUser, true);
});

it("fails when the thread composer retains its keyboard-open offset after dismissal", () => {
  assert.equal(
    threadComposerFooterRecoveryFailure({
      baselineBottom: 1900,
      keyboardOpenBottom: 1120,
      keyboardClosedBottom: 1120,
    }),
    "Thread composer remained 780px from its pre-keyboard position after the IME closed",
  );
});

it("accepts the thread composer returning to its pre-keyboard position", () => {
  assert.equal(
    threadComposerFooterRecoveryFailure({
      baselineBottom: 1900,
      keyboardOpenBottom: 1120,
      keyboardClosedBottom: 1896,
    }),
    null,
  );
});

it("fails when the thread composer remains below the open Android keyboard", () => {
  assert.equal(
    threadComposerKeyboardOpenFailure({
      baselineBottom: 1900,
      keyboardOpenBottom: 1800,
      imeTop: 1120,
    }),
    "Thread composer moved 100px of the expected 780px keyboard offset",
  );
});

it("accepts the thread composer tracking the open Android keyboard", () => {
  assert.equal(
    threadComposerKeyboardOpenFailure({
      baselineBottom: 1900,
      keyboardOpenBottom: 1130,
      imeTop: 1120,
    }),
    null,
  );
});

it("reads the visible IME boundary from Android window insets", () => {
  assert.equal(
    parseVisibleAndroidImeTop(`
      InsetsSource id=ime type=ime frame=[0,1180][1080,2400] visible=true
      InsetsSource id=navigationBars type=navigationBars frame=[0,2320][1080,2400] visible=true
    `),
    1180,
  );
  assert.equal(
    parseVisibleAndroidImeTop(
      "InsetsSource id=ime mType=ime mFrame=[0,1180][1080,2400] mVisible=false",
    ),
    null,
  );
  assert.equal(
    parseVisibleAndroidImeTop("InsetsSource type=ITYPE_IME frame=[0,1429][1080,2340] visible=true"),
    1429,
  );
  assert.equal(
    parseVisibleAndroidImeTop(`
      InsetsSource type=ITYPE_IME frame=[0,0][0,0] visible=true
      InsetsSource type=ITYPE_IME frame=[0,1429][1080,2340] visible=true
    `),
    1429,
  );
});

it("fails when New Thread controls extend behind the Android keyboard", () => {
  const xml = `<hierarchy>
    <node content-desc="Add image" class="android.view.View" visible-to-user="true" bounds="[0,1140][80,1220]" />
    <node content-desc="Thread settings" class="android.view.View" visible-to-user="true" bounds="[80,1140][600,1220]" />
    <node content-desc="Start task" class="android.view.View" visible-to-user="false" bounds="[940,1140][1080,1220]" />
  </hierarchy>`;
  assert.deepStrictEqual(newTaskComposerControlFailures(xml, 1180), [
    "Add image extends below the IME top (1180px)",
    "Thread settings extends below the IME top (1180px)",
    "Submit is not visible to the user",
  ]);
});

it("accepts visible New Thread controls above the Android keyboard", () => {
  const xml = `<hierarchy>
    <node content-desc="Add image" class="android.view.View" visible-to-user="true" bounds="[0,1000][80,1080]" />
    <node content-desc="Thread settings" class="android.view.View" visible-to-user="true" bounds="[80,1000][600,1080]" />
    <node content-desc="Queue task" class="android.view.View" visible-to-user="true" bounds="[940,1000][1080,1080]" />
  </hierarchy>`;
  assert.deepStrictEqual(newTaskComposerControlFailures(xml, 1180), []);
});

it("seeds a playful multi-environment project spectrum", () => {
  assert.deepStrictEqual(
    SHOWCASE_PROJECTS.map((project) => project.title),
    ["T3 Code", "React", "Linux"],
  );
  assert.deepStrictEqual(
    SHOWCASE_ENVIRONMENTS.map((environment) => environment.label),
    ["Moonbase Terminal", "Suspense Station", "Kernel Cabin"],
  );
  assert.equal(SHOWCASE_THREADS.length, 8);
  assert.equal(new Set(SHOWCASE_THREADS.map((thread) => thread.projectId)).size, 3);
  // Every project contributes to both the active block and the settled tail,
  // so each list scope screenshots with the same two-part structure.
  for (const project of SHOWCASE_PROJECTS) {
    const projectThreads = SHOWCASE_THREADS.filter((thread) => thread.projectId === project.id);
    assert.equal(
      projectThreads.some((thread) => "settled" in thread && thread.settled),
      true,
      `${project.title} has no settled thread`,
    );
    assert.equal(
      projectThreads.some((thread) => !("settled" in thread && thread.settled)),
      true,
      `${project.title} has no active thread`,
    );
  }
  assert.equal(
    SHOWCASE_PROJECTS.every((project) => project.favicon.includes("<svg")),
    true,
  );
});

it("reads multiline JSON from the pairing CLI", () => {
  assert.equal(
    parsePairingCredentialOutput('server log\n{\n  "credential": "PAIR-ME"\n}\n'),
    "PAIR-ME",
  );
});

it("encodes Android pairing URLs without shell-sensitive JSON quotes", () => {
  const urls = ["http://10.0.2.2:65164/#token=ONE", "http://10.0.2.2:65198/#token=TWO"];
  const encoded = encodeAndroidPairingUrls(urls);
  assert.equal(encoded.startsWith("json-uri:"), true);
  assert.deepStrictEqual(JSON.parse(decodeURIComponent(encoded.slice("json-uri:".length))), urls);
  assert.equal(encoded.includes('"'), false);
});
