// A reflection database for the Roblox classes this builder authors.
//
// Not the full API dump — the classes a generated experience actually uses,
// with property types exact enough to (a) coerce Rojo's implicit JSON values,
// (b) serialize to XML with the right element types, and (c) reject a
// property that does not exist on a class before Studio or Rojo does.

export type PropType =
  | "bool"
  | "string"
  | "int"
  | "float"
  | "Vector3"
  | "Vector2"
  | "Color3"
  | "BrickColor"
  | "UDim"
  | "UDim2"
  | "CFrame"
  | "Content"
  | "NumberRange"
  | "NumberSequence"
  | "ColorSequence"
  | "Font"
  | "Ref"
  | "Rect"
  | `Enum:${string}`;

export type ClassCategory =
  | "service"
  | "container"
  | "part"
  | "model"
  | "script"
  | "remote"
  | "value"
  | "gui-root"
  | "gui"
  | "gui-component"
  | "constraint"
  | "attachment"
  | "effect"
  | "light"
  | "sound"
  | "animation"
  | "character"
  | "interaction"
  | "lighting"
  | "misc";

export interface ClassInfo {
  name: string;
  superclass?: string;
  category: ClassCategory;
  /** Services cannot be created with Instance.new and must sit at the DataModel root. */
  service?: boolean;
  notCreatable?: boolean;
  deprecated?: string;
  props: Record<string, PropType>;
}

/**
 * Properties the XML format stores under a different name or type than the
 * Lua-visible property. Anything absent here serializes as itself.
 */
export const XML_PROPERTY_NAMES: Record<string, Record<string, string>> = {
  BasePart: { Size: "size", Color: "Color3uint8" },
  Part: { Shape: "shape" },
};

/** Derived properties that are not serialized; they must be expressed via another property. */
export const DERIVED_PROPERTIES: Record<string, Record<string, string>> = {
  BasePart: { Position: "CFrame", Orientation: "CFrame", Rotation: "CFrame" },
  Model: { WorldPivot: "the PrimaryPart's CFrame" },
};

function props(spec: string): Record<string, PropType> {
  const out: Record<string, PropType> = {};
  for (const entry of spec.split(/\s+/).filter(Boolean)) {
    const [name, type] = entry.split(":", 2);
    const rest = entry.slice(name.length + 1);
    out[name] = (type === "Enum" ? rest : type) as PropType;
  }
  return out;
}

const C: ClassInfo[] = [
  { name: "Instance", category: "misc", notCreatable: true, props: props("Name:string Archivable:bool") },

  // ------------------------------------------------------------ services
  { name: "Workspace", superclass: "Model", category: "service", service: true, props: props("Gravity:float FallenPartsDestroyHeight:float StreamingEnabled:bool") },
  { name: "ReplicatedStorage", superclass: "Instance", category: "service", service: true, props: {} },
  { name: "ReplicatedFirst", superclass: "Instance", category: "service", service: true, props: {} },
  { name: "ServerScriptService", superclass: "Instance", category: "service", service: true, props: props("LoadStringEnabled:bool") },
  { name: "ServerStorage", superclass: "Instance", category: "service", service: true, props: {} },
  { name: "StarterGui", superclass: "Instance", category: "service", service: true, props: props("ShowDevelopmentGui:bool ResetPlayerGuiOnSpawn:bool") },
  { name: "StarterPack", superclass: "Instance", category: "service", service: true, props: {} },
  {
    name: "StarterPlayer",
    superclass: "Instance",
    category: "service",
    service: true,
    props: props(
      "CameraMaxZoomDistance:float CameraMinZoomDistance:float CharacterWalkSpeed:float CharacterJumpPower:float CharacterJumpHeight:float CharacterUseJumpPower:bool LoadCharacterAppearance:bool AutoJumpEnabled:bool",
    ),
  },
  { name: "StarterPlayerScripts", superclass: "Instance", category: "container", notCreatable: true, props: {} },
  { name: "StarterCharacterScripts", superclass: "Instance", category: "container", notCreatable: true, props: {} },
  {
    name: "Lighting",
    superclass: "Instance",
    category: "service",
    service: true,
    props: props(
      "Ambient:Color3 Brightness:float ClockTime:float ColorShift_Bottom:Color3 ColorShift_Top:Color3 EnvironmentDiffuseScale:float EnvironmentSpecularScale:float ExposureCompensation:float FogColor:Color3 FogEnd:float FogStart:float GeographicLatitude:float GlobalShadows:bool OutdoorAmbient:Color3 ShadowSoftness:float TimeOfDay:string",
    ),
  },
  { name: "SoundService", superclass: "Instance", category: "service", service: true, props: props("RespectFilteringEnabled:bool") },
  { name: "Teams", superclass: "Instance", category: "service", service: true, props: {} },
  { name: "Players", superclass: "Instance", category: "service", service: true, props: props("CharacterAutoLoads:bool RespawnTime:float") },
  { name: "Chat", superclass: "Instance", category: "service", service: true, props: {} },
  { name: "TextChatService", superclass: "Instance", category: "service", service: true, props: {} },
  { name: "MaterialService", superclass: "Instance", category: "service", service: true, props: {} },

  // ------------------------------------------------------------ containers & models
  { name: "Folder", superclass: "Instance", category: "container", props: {} },
  { name: "Configuration", superclass: "Instance", category: "container", props: {} },
  { name: "PVInstance", superclass: "Instance", category: "misc", notCreatable: true, props: {} },
  { name: "Model", superclass: "PVInstance", category: "model", props: props("PrimaryPart:Ref WorldPivot:CFrame") },
  { name: "WorldModel", superclass: "Model", category: "model", props: {} },
  { name: "Camera", superclass: "PVInstance", category: "misc", props: props("CFrame:CFrame FieldOfView:float CameraType:Enum:CameraType") },
  { name: "Terrain", superclass: "BasePart", category: "part", notCreatable: true, props: {} },

  // ------------------------------------------------------------ parts
  {
    name: "BasePart",
    superclass: "PVInstance",
    category: "part",
    notCreatable: true,
    props: props(
      "Anchored:bool CanCollide:bool CanTouch:bool CanQuery:bool CastShadow:bool Massless:bool Locked:bool Size:Vector3 CFrame:CFrame Position:Vector3 Orientation:Vector3 Color:Color3 BrickColor:BrickColor Material:Enum:Material Transparency:float Reflectance:float CollisionGroup:string TopSurface:Enum:SurfaceType BottomSurface:Enum:SurfaceType",
    ),
  },
  { name: "Part", superclass: "BasePart", category: "part", props: props("Shape:Enum:PartType") },
  { name: "WedgePart", superclass: "BasePart", category: "part", props: {} },
  { name: "CornerWedgePart", superclass: "BasePart", category: "part", props: {} },
  { name: "TrussPart", superclass: "BasePart", category: "part", props: {} },
  { name: "SpawnLocation", superclass: "Part", category: "part", props: props("Duration:int Neutral:bool AllowTeamChangeOnTouch:bool TeamColor:BrickColor Enabled:bool") },
  { name: "Seat", superclass: "Part", category: "part", props: props("Disabled:bool") },
  { name: "VehicleSeat", superclass: "BasePart", category: "part", props: props("Disabled:bool MaxSpeed:float Torque:float TurnSpeed:float HeadsUpDisplay:bool") },
  {
    name: "MeshPart",
    superclass: "BasePart",
    category: "part",
    props: props("MeshId:Content TextureID:Content DoubleSided:bool RenderFidelity:Enum:RenderFidelity CollisionFidelity:Enum:CollisionFidelity"),
  },

  // ------------------------------------------------------------ scripts
  { name: "LuaSourceContainer", superclass: "Instance", category: "script", notCreatable: true, props: {} },
  { name: "BaseScript", superclass: "LuaSourceContainer", category: "script", notCreatable: true, props: props("Disabled:bool Enabled:bool RunContext:Enum:RunContext") },
  { name: "Script", superclass: "BaseScript", category: "script", props: {} },
  { name: "LocalScript", superclass: "Script", category: "script", props: {} },
  { name: "ModuleScript", superclass: "LuaSourceContainer", category: "script", props: {} },

  // ------------------------------------------------------------ communication & values
  { name: "RemoteEvent", superclass: "Instance", category: "remote", props: {} },
  { name: "UnreliableRemoteEvent", superclass: "Instance", category: "remote", props: {} },
  { name: "RemoteFunction", superclass: "Instance", category: "remote", props: {} },
  { name: "BindableEvent", superclass: "Instance", category: "remote", props: {} },
  { name: "BindableFunction", superclass: "Instance", category: "remote", props: {} },
  { name: "StringValue", superclass: "Instance", category: "value", props: props("Value:string") },
  { name: "IntValue", superclass: "Instance", category: "value", props: props("Value:int") },
  { name: "NumberValue", superclass: "Instance", category: "value", props: props("Value:float") },
  { name: "BoolValue", superclass: "Instance", category: "value", props: props("Value:bool") },
  { name: "ObjectValue", superclass: "Instance", category: "value", props: props("Value:Ref") },
  { name: "Vector3Value", superclass: "Instance", category: "value", props: props("Value:Vector3") },
  { name: "Color3Value", superclass: "Instance", category: "value", props: props("Value:Color3") },
  { name: "CFrameValue", superclass: "Instance", category: "value", props: props("Value:CFrame") },
  { name: "LocalizationTable", superclass: "Instance", category: "misc", props: {} },

  // ------------------------------------------------------------ GUI roots
  { name: "LayerCollector", superclass: "Instance", category: "gui-root", notCreatable: true, props: props("Enabled:bool ResetOnSpawn:bool ZIndexBehavior:Enum:ZIndexBehavior") },
  { name: "ScreenGui", superclass: "LayerCollector", category: "gui-root", props: props("DisplayOrder:int IgnoreGuiInset:bool ScreenInsets:Enum:ScreenInsets") },
  {
    name: "BillboardGui",
    superclass: "LayerCollector",
    category: "gui-root",
    props: props("Size:UDim2 StudsOffset:Vector3 ExtentsOffset:Vector3 AlwaysOnTop:bool MaxDistance:float Adornee:Ref LightInfluence:float ClipsDescendants:bool"),
  },
  {
    name: "SurfaceGui",
    superclass: "LayerCollector",
    category: "gui-root",
    props: props("Face:Enum:NormalId SizingMode:Enum:SurfaceGuiSizingMode PixelsPerStud:float CanvasSize:Vector2 Adornee:Ref LightInfluence:float AlwaysOnTop:bool ClipsDescendants:bool"),
  },

  // ------------------------------------------------------------ GUI objects
  {
    name: "GuiObject",
    superclass: "Instance",
    category: "gui",
    notCreatable: true,
    props: props(
      "Active:bool AnchorPoint:Vector2 AutomaticSize:Enum:AutomaticSize BackgroundColor3:Color3 BackgroundTransparency:float BorderColor3:Color3 BorderSizePixel:int BorderMode:Enum:BorderMode ClipsDescendants:bool LayoutOrder:int Position:UDim2 Rotation:float Size:UDim2 SizeConstraint:Enum:SizeConstraint Visible:bool ZIndex:int Interactable:bool",
    ),
  },
  { name: "Frame", superclass: "GuiObject", category: "gui", props: {} },
  { name: "CanvasGroup", superclass: "GuiObject", category: "gui", props: props("GroupColor3:Color3 GroupTransparency:float") },
  {
    name: "ScrollingFrame",
    superclass: "GuiObject",
    category: "gui",
    props: props(
      "CanvasSize:UDim2 CanvasPosition:Vector2 ScrollBarThickness:int ScrollBarImageColor3:Color3 ScrollBarImageTransparency:float ScrollingDirection:Enum:ScrollingDirection AutomaticCanvasSize:Enum:AutomaticSize ElasticBehavior:Enum:ElasticBehavior ScrollingEnabled:bool",
    ),
  },
  {
    name: "TextLabel",
    superclass: "GuiObject",
    category: "gui",
    props: props(
      "Text:string TextColor3:Color3 TextSize:float TextScaled:bool TextWrapped:bool TextXAlignment:Enum:TextXAlignment TextYAlignment:Enum:TextYAlignment TextTransparency:float TextStrokeTransparency:float TextStrokeColor3:Color3 FontFace:Font RichText:bool LineHeight:float TextTruncate:Enum:TextTruncate MaxVisibleGraphemes:int",
    ),
  },
  { name: "TextButton", superclass: "TextLabel", category: "gui", props: props("AutoButtonColor:bool Modal:bool Selected:bool") },
  {
    name: "TextBox",
    superclass: "TextLabel",
    category: "gui",
    props: props("PlaceholderText:string PlaceholderColor3:Color3 ClearTextOnFocus:bool MultiLine:bool TextEditable:bool"),
  },
  {
    name: "ImageLabel",
    superclass: "GuiObject",
    category: "gui",
    props: props(
      "Image:Content ImageColor3:Color3 ImageTransparency:float ScaleType:Enum:ScaleType SliceCenter:Rect SliceScale:float TileSize:UDim2 ResampleMode:Enum:ResamplerMode ImageRectOffset:Vector2 ImageRectSize:Vector2",
    ),
  },
  { name: "ImageButton", superclass: "ImageLabel", category: "gui", props: props("HoverImage:Content PressedImage:Content AutoButtonColor:bool Modal:bool Selected:bool") },
  {
    name: "ViewportFrame",
    superclass: "GuiObject",
    category: "gui",
    props: props("Ambient:Color3 LightColor:Color3 LightDirection:Vector3 CurrentCamera:Ref ImageColor3:Color3 ImageTransparency:float"),
  },
  { name: "VideoFrame", superclass: "GuiObject", category: "gui", props: props("Video:Content Looped:bool Playing:bool Volume:float") },

  // ------------------------------------------------------------ GUI components
  { name: "UIComponent", superclass: "Instance", category: "gui-component", notCreatable: true, props: {} },
  { name: "UICorner", superclass: "UIComponent", category: "gui-component", props: props("CornerRadius:UDim") },
  {
    name: "UIStroke",
    superclass: "UIComponent",
    category: "gui-component",
    props: props("Color:Color3 Thickness:float Transparency:float ApplyStrokeMode:Enum:ApplyStrokeMode LineJoinMode:Enum:LineJoinMode Enabled:bool"),
  },
  { name: "UIGradient", superclass: "UIComponent", category: "gui-component", props: props("Color:ColorSequence Transparency:NumberSequence Rotation:float Offset:Vector2 Enabled:bool") },
  { name: "UIPadding", superclass: "UIComponent", category: "gui-component", props: props("PaddingTop:UDim PaddingBottom:UDim PaddingLeft:UDim PaddingRight:UDim") },
  { name: "UIScale", superclass: "UIComponent", category: "gui-component", props: props("Scale:float") },
  { name: "UIAspectRatioConstraint", superclass: "UIComponent", category: "gui-component", props: props("AspectRatio:float AspectType:Enum:AspectType DominantAxis:Enum:DominantAxis") },
  { name: "UISizeConstraint", superclass: "UIComponent", category: "gui-component", props: props("MinSize:Vector2 MaxSize:Vector2") },
  { name: "UITextSizeConstraint", superclass: "UIComponent", category: "gui-component", props: props("MinTextSize:int MaxTextSize:int") },
  { name: "UIFlexItem", superclass: "UIComponent", category: "gui-component", props: props("FlexMode:Enum:UIFlexMode GrowRatio:float ShrinkRatio:float") },
  {
    name: "UIGridStyleLayout",
    superclass: "UIComponent",
    category: "gui-component",
    notCreatable: true,
    props: props("FillDirection:Enum:FillDirection HorizontalAlignment:Enum:HorizontalAlignment VerticalAlignment:Enum:VerticalAlignment SortOrder:Enum:SortOrder"),
  },
  {
    name: "UIListLayout",
    superclass: "UIGridStyleLayout",
    category: "gui-component",
    props: props("Padding:UDim Wraps:bool HorizontalFlex:Enum:UIFlexAlignment VerticalFlex:Enum:UIFlexAlignment"),
  },
  {
    name: "UIGridLayout",
    superclass: "UIGridStyleLayout",
    category: "gui-component",
    props: props("CellSize:UDim2 CellPadding:UDim2 FillDirectionMaxCells:int StartCorner:Enum:StartCorner"),
  },
  {
    name: "UIPageLayout",
    superclass: "UIGridStyleLayout",
    category: "gui-component",
    props: props("Animated:bool Circular:bool EasingStyle:Enum:EasingStyle Padding:UDim TweenTime:float ScrollWheelInputEnabled:bool TouchInputEnabled:bool GamepadInputEnabled:bool"),
  },

  // ------------------------------------------------------------ attachments & constraints
  { name: "Attachment", superclass: "Instance", category: "attachment", props: props("CFrame:CFrame Visible:bool") },
  { name: "Bone", superclass: "Attachment", category: "attachment", props: {} },
  { name: "Constraint", superclass: "Instance", category: "constraint", notCreatable: true, props: props("Attachment0:Ref Attachment1:Ref Enabled:bool Visible:bool") },
  { name: "WeldConstraint", superclass: "Instance", category: "constraint", props: props("Part0:Ref Part1:Ref Enabled:bool") },
  { name: "Weld", superclass: "Instance", category: "constraint", props: props("Part0:Ref Part1:Ref C0:CFrame C1:CFrame Enabled:bool") },
  { name: "Motor6D", superclass: "Weld", category: "constraint", props: props("MaxVelocity:float") },
  {
    name: "HingeConstraint",
    superclass: "Constraint",
    category: "constraint",
    props: props("ActuatorType:Enum:ActuatorType AngularVelocity:float AngularSpeed:float MotorMaxTorque:float ServoMaxTorque:float TargetAngle:float LimitsEnabled:bool UpperAngle:float LowerAngle:float"),
  },
  { name: "RopeConstraint", superclass: "Constraint", category: "constraint", props: props("Length:float Thickness:float") },
  { name: "RodConstraint", superclass: "Constraint", category: "constraint", props: props("Length:float Thickness:float") },
  { name: "SpringConstraint", superclass: "Constraint", category: "constraint", props: props("Stiffness:float Damping:float FreeLength:float LimitsEnabled:bool MaxLength:float MinLength:float") },
  { name: "BallSocketConstraint", superclass: "Constraint", category: "constraint", props: props("LimitsEnabled:bool UpperAngle:float TwistLimitsEnabled:bool") },
  { name: "PrismaticConstraint", superclass: "Constraint", category: "constraint", props: props("ActuatorType:Enum:ActuatorType LimitsEnabled:bool UpperLimit:float LowerLimit:float Speed:float Velocity:float") },
  { name: "AlignPosition", superclass: "Constraint", category: "constraint", props: props("MaxForce:float MaxVelocity:float Responsiveness:float RigidityEnabled:bool Position:Vector3") },
  { name: "AlignOrientation", superclass: "Constraint", category: "constraint", props: props("MaxTorque:float MaxAngularVelocity:float Responsiveness:float RigidityEnabled:bool") },
  { name: "LinearVelocity", superclass: "Constraint", category: "constraint", props: props("MaxForce:float VectorVelocity:Vector3 RelativeTo:Enum:ActuatorRelativeTo") },
  { name: "AngularVelocity", superclass: "Constraint", category: "constraint", props: props("MaxTorque:float AngularVelocity:Vector3 RelativeTo:Enum:ActuatorRelativeTo") },
  { name: "VectorForce", superclass: "Constraint", category: "constraint", props: props("Force:Vector3 ApplyAtCenterOfMass:bool RelativeTo:Enum:ActuatorRelativeTo") },
  { name: "Torque", superclass: "Constraint", category: "constraint", props: props("Torque:Vector3 RelativeTo:Enum:ActuatorRelativeTo") },

  // ------------------------------------------------------------ surfaces & effects
  { name: "Decal", superclass: "Instance", category: "effect", props: props("Texture:Content Face:Enum:NormalId Color3:Color3 Transparency:float ZIndex:int") },
  { name: "Texture", superclass: "Decal", category: "effect", props: props("StudsPerTileU:float StudsPerTileV:float OffsetStudsU:float OffsetStudsV:float") },
  { name: "SurfaceAppearance", superclass: "Instance", category: "effect", props: props("ColorMap:Content NormalMap:Content RoughnessMap:Content MetalnessMap:Content Color:Color3") },
  {
    name: "ParticleEmitter",
    superclass: "Instance",
    category: "effect",
    props: props(
      "Texture:Content Rate:float Lifetime:NumberRange Speed:NumberRange SpreadAngle:Vector2 Rotation:NumberRange RotSpeed:NumberRange Color:ColorSequence Size:NumberSequence Transparency:NumberSequence Squash:NumberSequence LightEmission:float LightInfluence:float Enabled:bool Acceleration:Vector3 Drag:float EmissionDirection:Enum:NormalId LockedToPart:bool ZOffset:float Orientation:Enum:ParticleOrientation Brightness:float TimeScale:float",
    ),
  },
  {
    name: "Beam",
    superclass: "Instance",
    category: "effect",
    props: props(
      "Attachment0:Ref Attachment1:Ref Color:ColorSequence Transparency:NumberSequence Width0:float Width1:float Texture:Content TextureSpeed:float TextureLength:float FaceCamera:bool Segments:int CurveSize0:float CurveSize1:float LightEmission:float Enabled:bool",
    ),
  },
  {
    name: "Trail",
    superclass: "Instance",
    category: "effect",
    props: props("Attachment0:Ref Attachment1:Ref Color:ColorSequence Transparency:NumberSequence Lifetime:float MinLength:float MaxLength:float WidthScale:NumberSequence Texture:Content LightEmission:float FaceCamera:bool Enabled:bool"),
  },
  { name: "Fire", superclass: "Instance", category: "effect", props: props("Heat:float Size:float Color:Color3 SecondaryColor:Color3 Enabled:bool") },
  { name: "Smoke", superclass: "Instance", category: "effect", props: props("Color:Color3 Opacity:float RiseVelocity:float Size:float Enabled:bool") },
  { name: "Sparkles", superclass: "Instance", category: "effect", props: props("SparkleColor:Color3 Enabled:bool") },
  { name: "Highlight", superclass: "Instance", category: "effect", props: props("FillColor:Color3 OutlineColor:Color3 FillTransparency:float OutlineTransparency:float DepthMode:Enum:HighlightDepthMode Adornee:Ref Enabled:bool") },

  // ------------------------------------------------------------ lights
  { name: "Light", superclass: "Instance", category: "light", notCreatable: true, props: props("Brightness:float Color:Color3 Enabled:bool Shadows:bool") },
  { name: "PointLight", superclass: "Light", category: "light", props: props("Range:float") },
  { name: "SpotLight", superclass: "Light", category: "light", props: props("Range:float Angle:float Face:Enum:NormalId") },
  { name: "SurfaceLight", superclass: "Light", category: "light", props: props("Range:float Angle:float Face:Enum:NormalId") },

  // ------------------------------------------------------------ lighting children
  { name: "Atmosphere", superclass: "Instance", category: "lighting", props: props("Density:float Offset:float Color:Color3 Decay:Color3 Glare:float Haze:float") },
  {
    name: "Sky",
    superclass: "Instance",
    category: "lighting",
    props: props("SkyboxBk:Content SkyboxDn:Content SkyboxFt:Content SkyboxLf:Content SkyboxRt:Content SkyboxUp:Content SunAngularSize:float MoonAngularSize:float StarCount:int CelestialBodiesShown:bool"),
  },
  { name: "PostEffect", superclass: "Instance", category: "lighting", notCreatable: true, props: props("Enabled:bool") },
  { name: "BloomEffect", superclass: "PostEffect", category: "lighting", props: props("Intensity:float Size:float Threshold:float") },
  { name: "ColorCorrectionEffect", superclass: "PostEffect", category: "lighting", props: props("Brightness:float Contrast:float Saturation:float TintColor:Color3") },
  { name: "SunRaysEffect", superclass: "PostEffect", category: "lighting", props: props("Intensity:float Spread:float") },
  { name: "BlurEffect", superclass: "PostEffect", category: "lighting", props: props("Size:float") },
  { name: "DepthOfFieldEffect", superclass: "PostEffect", category: "lighting", props: props("FarIntensity:float FocusDistance:float InFocusRadius:float NearIntensity:float") },

  // ------------------------------------------------------------ sound & animation
  {
    name: "Sound",
    superclass: "Instance",
    category: "sound",
    props: props("SoundId:Content Volume:float Looped:bool Playing:bool PlaybackSpeed:float RollOffMaxDistance:float RollOffMinDistance:float SoundGroup:Ref TimePosition:float PlayOnRemove:bool"),
  },
  { name: "SoundGroup", superclass: "Instance", category: "sound", props: props("Volume:float") },
  { name: "Animation", superclass: "Instance", category: "animation", props: props("AnimationId:Content") },
  { name: "AnimationController", superclass: "Instance", category: "animation", props: {} },
  { name: "Animator", superclass: "Instance", category: "animation", props: {} },

  // ------------------------------------------------------------ characters & interaction
  {
    name: "Humanoid",
    superclass: "Instance",
    category: "character",
    props: props(
      "DisplayName:string Health:float MaxHealth:float WalkSpeed:float JumpPower:float JumpHeight:float UseJumpPower:bool HipHeight:float RigType:Enum:HumanoidRigType DisplayDistanceType:Enum:HumanoidDisplayDistanceType AutoRotate:bool BreakJointsOnDeath:bool RequiresNeck:bool",
    ),
  },
  { name: "Tool", superclass: "Instance", category: "interaction", props: props("CanBeDropped:bool Enabled:bool ManualActivationOnly:bool RequiresHandle:bool ToolTip:string TextureId:Content Grip:CFrame") },
  {
    name: "ProximityPrompt",
    superclass: "Instance",
    category: "interaction",
    props: props(
      "ActionText:string ObjectText:string HoldDuration:float MaxActivationDistance:float KeyboardKeyCode:Enum:KeyCode GamepadKeyCode:Enum:KeyCode RequiresLineOfSight:bool Enabled:bool Style:Enum:ProximityPromptStyle UIOffset:Vector2 ClickablePrompt:bool Exclusivity:Enum:ProximityPromptExclusivity",
    ),
  },
  { name: "ClickDetector", superclass: "Instance", category: "interaction", props: props("MaxActivationDistance:float CursorIcon:Content") },
  { name: "Team", superclass: "Instance", category: "misc", props: props("TeamColor:BrickColor AutoAssignable:bool") },
  { name: "PathfindingModifier", superclass: "Instance", category: "misc", props: props("Label:string PassThrough:bool") },
];

export const CLASSES: Map<string, ClassInfo> = new Map(C.map((c) => [c.name, c]));

export function getClass(name: string): ClassInfo | undefined {
  return CLASSES.get(name);
}

export function isA(className: string, ancestor: string): boolean {
  for (let c: ClassInfo | undefined = CLASSES.get(className); c; c = c.superclass ? CLASSES.get(c.superclass) : undefined) {
    if (c.name === ancestor) return true;
  }
  return false;
}

/** The property's type, walking up the inheritance chain; undefined if the class has no such property. */
export function propType(className: string, prop: string): PropType | undefined {
  for (let c: ClassInfo | undefined = CLASSES.get(className); c; c = c.superclass ? CLASSES.get(c.superclass) : undefined) {
    const t = c.props[prop];
    if (t) return t;
  }
  return undefined;
}

/** The class in the chain that declares `prop`, for XML name overrides. */
export function declaringClass(className: string, prop: string): string | undefined {
  for (let c: ClassInfo | undefined = CLASSES.get(className); c; c = c.superclass ? CLASSES.get(c.superclass) : undefined) {
    if (c.props[prop]) return c.name;
  }
  return undefined;
}

export function allProps(className: string): Record<string, PropType> {
  const chain: ClassInfo[] = [];
  for (let c: ClassInfo | undefined = CLASSES.get(className); c; c = c.superclass ? CLASSES.get(c.superclass) : undefined) chain.unshift(c);
  return Object.assign({}, ...chain.map((c) => c.props));
}

export function xmlPropertyName(className: string, prop: string): string {
  const owner = declaringClass(className, prop);
  return (owner && XML_PROPERTY_NAMES[owner]?.[prop]) ?? prop;
}

export const SERVICE_NAMES = C.filter((c) => c.service).map((c) => c.name);

/** Creatable classes grouped for pickers in the UI. */
export function creatableByCategory(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of C) {
    if (c.notCreatable || c.service) continue;
    (out[c.category] ??= []).push(c.name);
  }
  return out;
}
