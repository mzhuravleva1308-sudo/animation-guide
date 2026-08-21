import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGuideJsonLd } from "./build-guide-json-ld.mjs";

describe("buildGuideJsonLd", () => {
  it("builds CollectionPage, ItemList, and breadcrumb graph", () => {
    const jsonLd = buildGuideJsonLd({
      origin: "https://resonale.com",
      path: "/guides/beautiful-animated-films",
      name: "Beautiful Animated Films Worth Discovering",
      description: "Beautiful animated films worth discovering.",
      filmTitles: ["Arco", "Tito and the Birds"],
    });

    assert.equal(jsonLd["@context"], "https://schema.org");
    const types = jsonLd["@graph"].map((node) => node["@type"]);
    assert.deepEqual(types, [
      "CollectionPage",
      "ItemList",
      "BreadcrumbList",
      "WebSite",
    ]);

    const list = jsonLd["@graph"].find((node) => node["@type"] === "ItemList");
    assert.equal(list.numberOfItems, 2);
    assert.equal(list.itemListElement[0].item.name, "Arco");
    assert.equal(list.itemListElement[0].item["@type"], "Movie");
    const breadcrumb = jsonLd["@graph"].find(
      (node) => node["@type"] === "BreadcrumbList"
    );
    assert.deepEqual(
      breadcrumb.itemListElement.map((item) => item.name),
      [
        "Home",
        "Guides",
        "Beautiful Animated Films Worth Discovering",
      ]
    );
  });
});
