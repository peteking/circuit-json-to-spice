import { test, expect } from "bun:test"
import type { AnyCircuitElement } from "circuit-json"
import { circuitJsonToSpice } from "lib/circuitJsonToSpice"

const GE_DIODE_MODEL = `
.subckt GE_DIODE anode cathode
D1 anode cathode GEMODEL
.model GEMODEL D(Is=6e-7 N=1.3)
.ends GE_DIODE
`.trim()

const createDiodeCircuit = (params: {
  withSpiceModel: boolean
}): AnyCircuitElement[] => {
  const pinNames = ["anode", "cathode"]
  const elements: AnyCircuitElement[] = [
    {
      type: "source_component",
      source_component_id: "source_component_D1",
      name: "D1",
      ftype: "simple_diode",
    } as AnyCircuitElement,
    ...pinNames.map(
      (pinName, index) =>
        ({
          type: "source_port",
          source_port_id: `source_port_D1_${pinName}`,
          source_component_id: "source_component_D1",
          name: pinName,
          pin_number: index + 1,
        }) as AnyCircuitElement,
    ),
    ...pinNames.map(
      (pinName) =>
        ({
          type: "source_net",
          source_net_id: `net_${pinName}`,
          name: pinName.toUpperCase(),
          member_source_group_ids: [],
        }) as AnyCircuitElement,
    ),
    ...pinNames.map(
      (pinName) =>
        ({
          type: "source_trace",
          source_trace_id: `trace_D1_${pinName}`,
          connected_source_port_ids: [`source_port_D1_${pinName}`],
          connected_source_net_ids: [`net_${pinName}`],
        }) as AnyCircuitElement,
    ),
  ]
  if (params.withSpiceModel) {
    elements.push({
      type: "simulation_spice_subcircuit",
      simulation_spice_subcircuit_id: "simulation_spice_subcircuit_D1",
      source_component_id: "source_component_D1",
      spice_pin_to_source_port_map: {
        anode: "source_port_D1_anode",
        cathode: "source_port_D1_cathode",
      },
      subcircuit_source: GE_DIODE_MODEL,
    } as AnyCircuitElement)
  }
  return elements
}

const builtInDiodeLines = (spiceString: string) =>
  spiceString.split("\n").filter((line) => /^DD1\s/i.test(line))

test("a diode without a spicemodel still gets its built-in element", () => {
  const spiceString = circuitJsonToSpice(
    createDiodeCircuit({ withSpiceModel: false }),
  ).toSpiceString()

  expect(builtInDiodeLines(spiceString)).toHaveLength(1)
})

test("a spicemodel on a built-in part replaces the built-in element", () => {
  const spiceString = circuitJsonToSpice(
    createDiodeCircuit({ withSpiceModel: true }),
  ).toSpiceString()

  // Only the subcircuit simulates D1: no default diode across the same nodes
  expect(builtInDiodeLines(spiceString)).toHaveLength(0)
  expect(spiceString).not.toMatch(/^\.model D /im)

  const callLines = spiceString
    .split("\n")
    .filter((line) => line.startsWith("Xsimulation_spice_subcircuit_D1"))
  expect(callLines).toHaveLength(1)
  expect(callLines[0]).toEndWith(" GE_DIODE")
  expect(spiceString).toContain(GE_DIODE_MODEL)
})
