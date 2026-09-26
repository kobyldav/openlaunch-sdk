"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgenciesResource = void 0;
const mappers_js_1 = require("../mappers.js");
const base_js_1 = require("./base.js");
class AgenciesResource extends base_js_1.BaseResource {
    constructor(http) { super(http, "agencies"); }
    map = mappers_js_1.mapAgency;
}
exports.AgenciesResource = AgenciesResource;
//# sourceMappingURL=agencies.js.map