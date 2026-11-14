import { describe, expect, it } from "vitest";
import { familyKey, measure, parseTitle, splitOptionTitle, type Options } from "./parse";

/** Real titles from the WCP and AndyMark catalogs (Nov 2026): title, family title, options. */
const cases: Record<string, [string, string, Options][]> = {
  gears: [
    ["100t CD Steel Gear Bundle","Steel Gear Bundle",{"cd":"100t"}],
    ["10t Steel Spur Gear (20 DP, 12t Center Distance, 8mm Key Bore)","Steel Spur Gear (20 DP)",{"cd":"12t","teeth":"10t","bore":"8mm Key"}],
    ["11t x 1/2\" Wide Steel Spur Gear (20 DP, 12t CD, 8mm SplineXS Bore)","Steel Spur Gear (20 DP)",{"cd":"12t","width":"1/2\"","teeth":"11t","bore":"8mm SplineXS"}],
    ["12t Steel Spur Gear (20 DP, CIM Motor, Pinion Only)","Steel Spur Gear (20 DP, CIM Motor, Pinion Only)",{"teeth":"12t"}],
    ["13t Steel Spur Gear (20 DP, 14t Center Distance, Falcon Bore)","Steel Spur Gear (20 DP)",{"cd":"14t","teeth":"13t","bore":"Falcon"}],
    ["14t Steel Spur Gear (20 DP, 16t Center Distance, 8mm SplineXS Bore)","Steel Spur Gear (20 DP)",{"cd":"16t","teeth":"14t","bore":"8mm SplineXS"}],
    ["15t 1:1 Aluminum Bevel Gear (15t:15t, 12 DP, 1/2\" Hex Bore)","1:1 Aluminum Bevel Gear (15t:15t, 12 DP)",{"teeth":"15t","bore":"1/2\" Hex"}],
    ["15t Steel Spur Gear (20 DP, 16t Center Distance, 8mm Key Bore)","Steel Spur Gear (20 DP)",{"cd":"16t","teeth":"15t","bore":"8mm Key"}],
    ["16t Aluminum Spur Gear (20 DP, 3/8\" Hex Bore)","Aluminum Spur Gear (20 DP)",{"teeth":"16t","bore":"3/8\" Hex"}],
    ["16t x 1/2\" Wide Steel Spur Gear (20 DP, 8mm SplineXS Bore)","Steel Spur Gear (20 DP)",{"width":"1/2\"","teeth":"16t","bore":"8mm SplineXS"}],
    ["18t Aluminum Spur Gear (20 DP, 1/4\" Round)","Aluminum Spur Gear (20 DP, 1/4\" Round)",{"teeth":"18t"}],
    ["18t x 1/2\" Wide Steel Spur Gear (20DP, 19t CD, 8mm SplineXS Bore)","Steel Spur Gear (20DP)",{"cd":"19t","width":"1/2\"","teeth":"18t","bore":"8mm SplineXS"}],
    ["20t Aluminum Spur Gear (20 DP, 1/2\" Hex Bore)","Aluminum Spur Gear (20 DP)",{"teeth":"20t","bore":"1/2\" Hex"}],
    ["20t x 1/2\" Wide Steel Spur Gear (20 DP, 8mm SplineXS Bore)","Steel Spur Gear (20 DP)",{"width":"1/2\"","teeth":"20t","bore":"8mm SplineXS"}],
    ["22t Steel Spur Gear (20 DP, 3/8\" Hex Bore)","Steel Spur Gear (20 DP)",{"teeth":"22t","bore":"3/8\" Hex"}],
    ["12 Tooth 20 DP CIM Hardware Kit","20 DP CIM Hardware Kit",{"teeth":"12t"}],
    ["17 Tooth 0.48 Module 0.125 in. Round Bore Steel Pinion Gear","0.48 Module Steel Pinion Gear",{"teeth":"17t","bore":"0.125\" Round"}],
    ["20 Tooth 1.5 Module 3/8 in. Hex Bore Steel Bevel Gear","1.5 Module Steel Bevel Gear",{"teeth":"20t","bore":"3/8\" Hex"}],
    ["56 Tooth 20 DP 0.5 in. Round Bore Steel Bolt Circle Gear","20 DP Steel Bolt Circle Gear",{"teeth":"56t","bore":"0.5\" Round"}],
    ["Robits 5 in. Snail Cam","Robits 5 in. Snail Cam",{}],
  ],
  belts: [
    [".625\" ID Bi Directional Energy Chain (3ft Length)","Bi Directional Energy Chain (3ft Length)",{"id":".625\""}],
    ["#35 Roller Chain (10 feet)","#35 Roller Chain (10 feet)",{}],
    ["1/4\" Black Polycord (50FT)","1/4\" Black Polycord (50FT)",{}],
    ["105t x 9mm Wide Timing Belt (HTD 5mm)","Timing Belt (HTD 5mm)",{"width":"9mm","teeth":"105t"}],
    ["120t x 15mm Wide Rubber Coated Timing Belt (HTD 5mm, 45A)","Rubber Coated Timing Belt (HTD 5mm, 45A)",{"width":"15mm","teeth":"120t"}],
    ["12t Aluminum Hub Double Sprocket (#35 Chain, 1/2\" ID)","Aluminum Hub Double Sprocket (#35 Chain)",{"id":"1/2\"","teeth":"12t"}],
    ["12t x 9mm Wide Aluminum Pulley (GT2 3mm, RS775 Bore)","Aluminum Pulley (GT2 3mm)",{"width":"9mm","teeth":"12t","bore":"RS775"}],
    ["140t x 9mm Wide Timing Belt (GT2 3mm)","Timing Belt (GT2 3mm)",{"width":"9mm","teeth":"140t"}],
    ["150t x 9mm Wide Timing Belt (GT2 3mm)","Timing Belt (GT2 3mm)",{"width":"9mm","teeth":"150t"}],
    ["15t Aluminum Hub Double Sprocket (#35 Chain, 1/2\" Hex Bore)","Aluminum Hub Double Sprocket (#35 Chain)",{"teeth":"15t","bore":"1/2\" Hex"}],
    ["160t x 15mm Wide Timing Belt (HTD 5mm)","Timing Belt (HTD 5mm)",{"width":"15mm","teeth":"160t"}],
    ["16t x 15mm Wide Aluminum Pulley (GT2 3mm, 8mm SplineXS Bore)","Aluminum Pulley (GT2 3mm)",{"width":"15mm","teeth":"16t","bore":"8mm SplineXS"}],
    ["175t x 15mm Wide Timing Belt (HTD 5mm)","Timing Belt (HTD 5mm)",{"width":"15mm","teeth":"175t"}],
    ["18t Aluminum Double Hub Sprocket (#25 Chain, 1/2\" Hex Bore)","Aluminum Double Hub Sprocket (#25 Chain)",{"teeth":"18t","bore":"1/2\" Hex"}],
    ["190t x 15mm Wide Rubber Coated Timing Belt (HTD 5mm, 45A)","Rubber Coated Timing Belt (HTD 5mm, 45A)",{"width":"15mm","teeth":"190t"}],
    ["2\"x60\" Grinder Belt (180 Grit)","2\"x60\" Grinder Belt (180 Grit)",{}],
    ["#35 Chain Break Replacement Bolt","#35 Chain Break Replacement Bolt",{}],
    ["24 Tooth 0.5 in. Hex Bore 5 mm HTD 9 mm Wide Aluminum Pulley","5 mm HTD Aluminum Pulley",{"width":"9mm","teeth":"24t","bore":"0.5\" Hex"}],
    ["35 Series Bearing Bore Plate Sprockets","35 Series Bearing Bore Plate Sprockets",{}],
    ["Black Flat Urethane Track Timing Belt Tread","Black Flat Urethane Track Timing Belt Tread",{}],
  ],
  bearings: [
    [".375\" ID x .500\" Hex OD x .313\" WD (Bronze Flanged Bushing) (6-Pack)","Bronze Flanged Bushing (6-Pack)",{"id":".375\"","od":".500\" Hex","width":".313\""}],
    ["0.250\" ID x 0.500\" OD x 0.313\" WD Bronze Bushing (Flanged) (6-Pack)","Bronze Bushing (Flanged) (6-Pack)",{"id":"0.250\"","od":"0.500\"","width":"0.313\""}],
    ["0.375\" ID x 0.625\" OD x 0.313\" WD Bronze Bushing (Flanged) (6-Pack)","Bronze Bushing (Flanged) (6-Pack)",{"id":"0.375\"","od":"0.625\"","width":"0.313\""}],
    ["0.500\" ID x 0.750\" OD x 0.313\" WD Bronze Bushing (Flanged) (6-Pack)","Bronze Bushing (Flanged) (6-Pack)",{"id":"0.500\"","od":"0.750\"","width":"0.313\""}],
    ["0.625\" OD Cam Follower (#10-32) (2-Pack)","Cam Follower (#10-32) (2-Pack)",{"od":"0.625\""}],
    ["1.5\" ID x 1.875\" OD x .1875\" WD (X-Contact Bearing)","X-Contact Bearing",{"id":"1.5\"","od":"1.875\"","width":".1875\""}],
    ["10.25mm (3/8\" Rounded Hex) ID x 0.875\" OD x 0.280\" WD (Flanged Bearing)","Flanged Bearing",{"id":"10.25mm (3/8\" Rounded Hex)","od":"0.875\"","width":"0.280\""}],
    ["13.75mm (1/2\" Rounded Hex) ID x 0.875\" OD x 0.281\" WD (Flanged Bearing)","Flanged Bearing",{"id":"13.75mm (1/2\" Rounded Hex)","od":"0.875\"","width":"0.281\""}],
    ["17mm ID x 26mm OD x 5mm WD (Flanged Bearing)","Flanged Bearing",{"id":"17mm","od":"26mm","width":"5mm"}],
    ["2\" Bearing Block (.06\" Offset, SplineXL Bore)","2\" Bearing Block (.06\" Offset)",{"bore":"SplineXL"}],
    ["3.5\" ID x 4\" OD x .25\" WD (X-Contact Sealed Bearing)","X-Contact Sealed Bearing",{"id":"3.5\"","od":"4\"","width":".25\""}],
    ["35mm ID x 44mm OD x 5mm WD (Radial Bearing)","Radial Bearing",{"id":"35mm","od":"44mm","width":"5mm"}],
    ["6\" ID x 6.5\" OD x .25\" WD (X-Contact Bearing)","X-Contact Bearing",{"id":"6\"","od":"6.5\"","width":".25\""}],
    ["8mm ID x 16mm OD x 5mm WD (Radial Bearing)","Radial Bearing",{"id":"8mm","od":"16mm","width":"5mm"}],
    ["0.031 in. Thick 1.125 in. ID Steel Bearing Washer","0.031 in. Thick Steel Bearing Washer",{"id":"1.125\""}],
    ["1 in. x 1 in. Bearing Block Kit","1 in. x 1 in. Bearing Block Kit",{}],
    ["1/4 in. ID 5/8 in. OD Shielded Flanged Bearing (FR4ZZ)","Shielded Flanged Bearing (FR4ZZ)",{"id":"1/4\"","od":"5/8\""}],
    ["3/8 (0.375) in. Hex ID Sealed Bearing (R62RS-Hex)","3/8 (0.375) in. Hex ID Sealed Bearing (R62RS-Hex)",{}],
    ["5 mm ID 9 mm OD Shielded Bearing (95-2Z)","Shielded Bearing (95-2Z)",{"id":"5mm","od":"9mm"}],
    ["BIOBUZZ™ Hive Cell Pivot Bearing Plate","BIOBUZZ™ Hive Cell Pivot Bearing Plate",{}],
  ],
  shafts: [
    [".159\" ID x SplineXL OD MotionX Hub (Aluminum, #10-32 Clearance)","MotionX Hub (Aluminum, #10-32 Clearance)",{"id":".159\"","od":"SplineXL"}],
    [".500\" OD x .159\" ID Hex Stock (36\")","Hex Stock",{"id":".159\"","od":".500\"","length":"36\""}],
    ["1-1/4\" WD x .196\" ID x 3/8\" OD Aluminum Spacers (5-Pack)","Aluminum Spacers (5-Pack)",{"id":".196\"","od":"3/8\"","width":"1-1/4\""}],
    ["1\" WD x .196\" ID x 3/8\" OD Aluminum Spacers (5-Pack)","Aluminum Spacers (5-Pack)",{"id":".196\"","od":"3/8\"","width":"1\""}],
    ["1/2\" Hex Clamping Shaft Collar (High Strength, Balanced)","1/2\" Hex Clamping Shaft Collar (High Strength, Balanced)",{}],
    ["1/2\" WD x .196\" ID x 3/8\" OD Aluminum Spacers (5-Pack)","Aluminum Spacers (5-Pack)",{"id":".196\"","od":"3/8\"","width":"1/2\""}],
    ["1/4\" WD x 1/2\" Hex ID x 3/4\" OD Plastic Spacer (10-Pack)","Plastic Spacer (10-Pack)",{"id":"1/2\" Hex","od":"3/4\"","width":"1/4\""}],
    ["1/8\" Hex-Plus Bit (50mm)","1/8\" Hex-Plus Bit (50mm)",{}],
    ["2-1/2\" WD x #10-32 ID x 1/2\" OD Aluminum Threaded Hex Standoff","Aluminum Threaded Hex Standoff",{"id":"#10-32","od":"1/2\"","width":"2-1/2\""}],
    ["2\" WD x .196\" ID x 1/2\" OD Aluminum Spacers (5-Pack)","Aluminum Spacers (5-Pack)",{"id":".196\"","od":"1/2\"","width":"2\""}],
    ["3\" WD x #10-32 ID x 3/8\" OD Aluminum Threaded Hex Standoffs (5-Pack)","Aluminum Threaded Hex Standoffs (5-Pack)",{"id":"#10-32","od":"3/8\"","width":"3\""}],
    ["3/32\" Hex-Plus Bit (50mm)","3/32\" Hex-Plus Bit (50mm)",{}],
    ["0.115 in. ID 0.187 in. OD 0.188 in. Long Nylon Spacer","Nylon Spacer",{"id":"0.115\"","od":"0.187\"","length":"0.188\""}],
    ["0.192 in. ID 0.375 in. OD 0.750 in. Long Nylon Spacer","Nylon Spacer",{"id":"0.192\"","od":"0.375\"","length":"0.750\""}],
    ["0.231 in. ID 0.500 in. OD 2.750 in. Long Aluminum Churro Spacer","Aluminum Churro Spacer",{"id":"0.231\"","od":"0.500\"","length":"2.750\""}],
    ["0.319 in. ID 0.438 in. OD 0.313 in. Long Aluminum Spacer","Aluminum Spacer",{"id":"0.319\"","od":"0.438\"","length":"0.313\""}],
    ["0.382 in. ID 0.625 in. OD 0.531 in. Long Aluminum Spacer","Aluminum Spacer",{"id":"0.382\"","od":"0.625\"","length":"0.531\""}],
    ["0.5 in. Hex Hub","0.5 in. Hex Hub",{}],
    ["1/2 in. Hex Collar Clamps","1/2 in. Hex Collar Clamps",{}],
    ["1/4-20 x 1.75 in. Hex Head Screw","1/4-20 x 1.75 in. Hex Head Screw",{}],
  ],
};

describe("parseTitle on real titles", () => {
  for (const [category, rows] of Object.entries(cases)) {
    describe(category, () => {
      it.each(rows)("%s", (title, familyTitle, options) => {
        const parsed = parseTitle(title);
        expect(parsed.familyTitle).toBe(familyTitle);
        expect(parsed.options).toEqual(options);
      });
    });
  }
});

describe("parseTitle", () => {
  it("puts sizes of the same part in the same family", () => {
    const a = parseTitle('12t Steel Spur Gear (20 DP, 8mm SplineXS Bore)');
    const b = parseTitle('36t Steel Spur Gear (20DP, 1/2" Hex Bore)');
    expect(a.key).toBe(b.key);
    expect(a.options).toEqual({ teeth: "12t", bore: "8mm SplineXS" });
  });

  it("strips a reseller's brand prefix", () => {
    expect(parseTitle('WCP 44t Pocketed Aluminum Spur Gear (20 DP, 1/2" Hex Bore)').key).toBe(
      parseTitle('46t Pocketed Aluminum Spur Gear (20 DP, 1/2" Hex Bore)').key,
    );
  });

  it("leaves gear pairs and belt ranges alone", () => {
    expect(parseTitle("WCP SwerveX Central Gear (42t/30t, Aluminum)").options).toEqual({});
    expect(parseTitle("HTD 9mm Belts Bundle (155t-200t)").options).toEqual({});
  });

  it("records DP, pitch and material as specs", () => {
    const keys = parseTitle('30t x 9mm Wide Aluminum Pulley (HTD 5mm, 1/2" Hex Bore)').specs.map((s) => `${s.key}=${s.value}`);
    expect(keys).toEqual(expect.arrayContaining(["pitch=HTD 5mm", "material=Aluminum", "teeth=30t", "width=9mm", 'bore=1/2" Hex']));
    expect(parseTitle("16t Steel Spur Gear (20 DP, 3/8\" Hex Bore)").specs).toContainEqual({ key: "dp", value: "20 DP", num: 20, unit: "DP" });
  });
});

describe("measure", () => {
  it("reads inches, millimetres and teeth", () => {
    expect(measure('1-1/2"')).toEqual({ num: 1.5, unit: "in" });
    expect(measure('3/8" Hex')).toEqual({ num: 0.375, unit: "in" });
    expect(measure('.196"')).toEqual({ num: 0.196, unit: "in" });
    expect(measure("13.75mm (1/2\" Rounded Hex)")).toEqual({ num: 13.75, unit: "mm" });
    expect(measure("36t")).toEqual({ num: 36, unit: "t" });
    expect(measure("SplineXL")).toEqual({ num: null, unit: null });
  });
});

describe("familyKey", () => {
  it("ignores case, quotes and DP spacing", () => {
    expect(familyKey('Steel Spur Gear (20DP)')).toBe(familyKey("steel spur gear (20 dp)"));
  });
});

describe("splitOptionTitle", () => {
  it("reads AndyMark's combined-listing titles, colons and commas inside values included", () => {
    expect(splitOptionTitle("SDS MK4i Swerve Modules - Motor Pinion Type:Falcon Spline, Gear Ratio:L3 6.12:1, Wheel Type:Colson Wheel")).toEqual({
      base: "SDS MK4i Swerve Modules",
      options: [
        { name: "Motor Pinion Type", value: "Falcon Spline" },
        { name: "Gear Ratio", value: "L3 6.12:1" },
        { name: "Wheel Type", value: "Colson Wheel" },
      ],
    });
    expect(splitOptionTitle("SDS MK4 Pinion Kits - Gear Ratio:L1, L2, L3, # of Motors:2")?.options).toEqual([
      { name: "Gear Ratio", value: "L1, L2, L3" },
      { name: "# of Motors", value: "2" },
    ]);
  });

  it("leaves ordinary titles with a dash alone", () => {
    expect(splitOptionTitle("WAGO 221 Inline Splicing Connector - 12 AWG - 50 Pack")).toBeNull();
    expect(splitOptionTitle("50 Feet - Bonded 12 AWG Flexible Silicone Jacketed Wire")).toBeNull();
    expect(splitOptionTitle("Kraken X60 Powered by TalonFX")).toBeNull();
  });
});

describe("parseTitle for wire", () => {
  it("reads a leading gauge and colour, and nothing from a gauge inside the name", () => {
    expect(parseTitle("18AWG Black Thin Insulation Wire (25-feet)")).toMatchObject({
      familyTitle: "Thin Insulation Wire (25-feet)",
      options: { awg: "18AWG", color: "Black" },
    });
    expect(parseTitle('Kraken Wire Bundle 18" (10 AWG Power, 22 AWG CAN)').options).toEqual({});
    expect(parseTitle("10-12 AWG Yellow Butt Connector Qty. 10").options).toEqual({});
  });
});
