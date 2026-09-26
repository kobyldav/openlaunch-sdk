"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RocketsResource = void 0;
const mappers_js_1 = require("../mappers.js");
const base_js_1 = require("./base.js");
class RocketsResource extends base_js_1.BaseResource {
    constructor(http) { super(http, "launcher_configurations"); }
    map = mappers_js_1.mapRocket;
}
exports.RocketsResource = RocketsResource;
//# sourceMappingURL=rockets.js.map