# Surge Configuration Language

This context defines the language shared by Surge configuration documents and the routing concepts they express.

## Language

**Surge configuration document**:
A text document accepted by Surge configuration tooling, encompassing profiles, detached profiles, and modules.
_Avoid_: Surge conf, INI file

**Profile**:
A standalone Surge configuration document describing traffic capture, request matching, and outbound policy selection.
_Avoid_: Config, configuration file

**Detached profile**:
A Surge configuration document whose sections are incorporated into a profile through an include directive; it may contain one section, multiple sections, or a complete profile.
_Avoid_: Fragment, partial config

**Module**:
A Surge configuration document applied as a higher-priority patch to a profile, with a restricted set of sections and merge operations.
_Avoid_: Plugin, profile

## Routing

**Policy**:
A named outbound behavior selected after a request is matched; it may be built in, proxy-backed, or represented by a policy group.
_Avoid_: Route, proxy

**Proxy policy**:
A policy that forwards requests to a proxy server using a configured protocol.
_Avoid_: Proxy, server

**Policy group**:
A policy that exposes a collection of policies under one name and chooses among them manually or automatically.
_Avoid_: Proxy group, group

**Rule**:
An ordered match declaration that selects a policy for a request.
_Avoid_: Filter, route
