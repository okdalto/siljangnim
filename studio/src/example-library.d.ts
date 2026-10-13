declare module "virtual:example-library" {
  const entries: Array<import("./project/examples").ExampleMeta & {
    slug: string;
    thumbnail: string;
    files: import("./project/exampleCache").ExampleFile[];
  }>;
  export default entries;
}
