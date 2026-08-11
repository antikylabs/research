import shader from "./triangle.shader.js";

export default {
  ...shader,
  bindGroups: [
    {
      group: 0,
      entries: [
        {
          name: "tint",
          binding: 1,
          visibility: ["fragment"],
          buffer: { type: "uniform", minBindingSize: 16 },
        },
      ],
    },
  ],
};
