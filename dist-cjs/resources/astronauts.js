"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AstronautsResource = void 0;
const mappers_js_1 = require("../mappers.js");
const base_js_1 = require("./base.js");
class AstronautsResource extends base_js_1.BaseResource {
    constructor(http) { super(http, "astronauts"); }
    map = mappers_js_1.mapAstronaut;
}
exports.AstronautsResource = AstronautsResource;
//# sourceMappingURL=astronauts.js.map