// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "IrukaAutomation",
  platforms: [
    .macOS(.v13),
  ],
  products: [
    .executable(
      name: "IrukaAutomation",
      targets: ["IrukaAutomation"]
    ),
  ],
  targets: [
    .executableTarget(
      name: "IrukaAutomation",
      path: "Sources"
    ),
  ]
)
