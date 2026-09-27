# Provider strategy

## Launch Library 2

Primary source for launches, agencies, astronauts, spacecraft, stations, pads, payloads and related spaceflight metadata. The SDK currently targets LL2 2.3.0.

## NASA

NASA APIs are heterogeneous and can be moved or archived independently. OpenLaunch therefore provides common convenience calls plus a raw escape hatch.

## CelesTrak

OpenLaunch defaults to OMM JSON for GP data. TLE remains available for compatible legacy catalog numbers, but modern OMM formats avoid the 5-digit catalog-number limitation.

All external data should be cached responsibly and stamped with retrieval time/provenance by applications that use it for engineering workflows.
