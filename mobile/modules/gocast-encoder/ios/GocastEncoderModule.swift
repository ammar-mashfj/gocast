import ExpoModulesCore

// iOS encoding is not built yet: the phase 0 spike is Android-first because
// there is no iPhone test setup. The functions exist so the module links and
// the JS side fails with a clear message instead of a missing-module crash.
public class GocastEncoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GocastEncoder")

    Function("start") { (_: Int, _: Int, _: Int) in
      throw Exception(name: "ERR_UNSUPPORTED", description: "Broadcasting from iOS is not built yet")
    }

    Function("encode") { (_: Float32Array, _: Float32Array?) -> Data in
      Data()
    }

    Function("stop") {}
  }
}
