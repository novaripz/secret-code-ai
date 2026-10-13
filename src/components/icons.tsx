// The app's icon set.
//
// Every glyph comes from Lucide (https://lucide.dev), an open-source icon
// family under the ISC license — free to use, modify and redistribute, which
// is what lets this app be handed to a whole school without anyone checking a
// licence first. Nothing here is hand-drawn any more: a hand-made set drifts
// (stroke widths, corner radii, optical size) one icon at a time, and students
// read that drift as "this app is unfinished".
//
// The exports keep the names the app already used, so a call site never needs
// to know which library is underneath. Add new icons the same way: pick one at
// lucide.dev, import it, and wrap it below.
import type { ComponentType, SVGProps } from "react";
import {
  AlarmClock,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Award,
  Bookmark,
  BookOpen,
  Bot,
  Brain,
  Braces,
  Bug,
  Calculator,
  Calendar,
  CalendarCheck,
  CalendarDays,
  Camera,
  Captions,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clapperboard,
  ClipboardList,
  Clock,
  Code,
  Columns2,
  Command,
  Copy,
  CopyPlus,
  Diff,
  Download,
  Ellipsis,
  EllipsisVertical,
  Expand,
  ExternalLink,
  Eye,
  File,
  FileCode,
  FileDown,
  FileJson,
  FilePlus,
  Files,
  FileText,
  FileType,
  Film,
  Filter,
  Flame,
  FlaskConical,
  Folder,
  FolderOpen,
  FolderPlus,
  Gamepad2,
  Globe,
  GraduationCap,
  GripVertical,
  Hammer,
  Heart,
  History,
  House,
  Image,
  Info,
  Keyboard,
  Landmark,
  Languages,
  LayoutGrid,
  Lightbulb,
  List,
  ListTodo,
  ListVideo,
  LoaderCircle,
  Lock,
  LogOut,
  Map as MapGlyph,
  Maximize2,
  Menu,
  MessageCircle,
  Mic,
  Minimize2,
  Monitor,
  Moon,
  Music,
  NotebookPen,
  Palette,
  PanelLeft,
  PanelRight,
  Paperclip,
  Pause,
  Pencil,
  PictureInPicture2,
  Pin,
  Play,
  Plus,
  RectangleHorizontal,
  RefreshCw,
  Replace,
  Rocket,
  RotateCcw,
  Save,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Shrink,
  Sigma,
  SkipForward,
  SlidersHorizontal,
  Smartphone,
  Sparkle,
  Sparkles,
  Square,
  SquareCode,
  Star,
  Sun,
  Tablet,
  Target,
  Terminal,
  ThumbsUp,
  Timer,
  Trash2,
  TriangleAlert,
  Trophy,
  TvMinimalPlay,
  Type,
  Undo2,
  Redo2,
  Upload,
  User,
  Video,
  Volume2,
  WandSparkles,
  WrapText,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

export type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number | string };
export type IconComponent = (props: IconProps) => React.ReactElement;

/**
 * Wraps a Lucide glyph with the app's defaults: decorative unless told
 * otherwise (every icon here sits next to a visible label or inside a button
 * that carries an aria-label), and a slightly lighter stroke than Lucide's 2px,
 * which reads cleaner at the 16–20px sizes this interface draws them at.
 */
function wrap(Glyph: ComponentType<LucideProps>, defaults: Partial<LucideProps> = {}): IconComponent {
  function Icon(props: IconProps) {
    return <Glyph aria-hidden="true" strokeWidth={1.85} {...defaults} {...(props as LucideProps)} />;
  }
  Icon.displayName = `Icon(${Glyph.displayName ?? "lucide"})`;
  return Icon;
}

// ---- Names the app already used ---------------------------------------------
export const ChevronRightIcon = wrap(ChevronRight);
export const ChevronLeftIcon = wrap(ChevronLeft);
export const ChevronDownIcon = wrap(ChevronDown);
export const ChevronUpIcon = wrap(ChevronUp);
export const FolderIcon = wrap(Folder);
export const FolderOpenIcon = wrap(FolderOpen);
export const FileIcon = wrap(File);
export const PlusFileIcon = wrap(FilePlus);
export const ImageIcon = wrap(Image);
export const PlusFolderIcon = wrap(FolderPlus);
export const TrashIcon = wrap(Trash2);
export const PlayIcon = wrap(Play);
export const RefreshIcon = wrap(RefreshCw);
export const DownloadIcon = wrap(Download);
export const UploadIcon = wrap(Upload);
export const SaveIcon = wrap(Save);
/** An arrow, not a paper plane: the send button reads "go" at a glance. */
export const SendIcon = wrap(ArrowUp, { strokeWidth: 2.25 });
export const CheckIcon = wrap(Check, { strokeWidth: 2.25 });
export const XIcon = wrap(X, { strokeWidth: 2.1 });
export const SparkleIcon = wrap(Sparkles);
export const CameraIcon = wrap(Camera);
export const CopyIcon = wrap(Copy);
/** The screen-share capture, as distinct from the camera that takes a photo. */
export const MonitorIcon = wrap(Monitor);
export const LightbulbIcon = wrap(Lightbulb);
export const BookIcon = wrap(BookOpen);
export const SettingsIcon = wrap(Settings);
export const ChatIcon = wrap(MessageCircle);
export const HammerIcon = wrap(Hammer);
export const PaperclipIcon = wrap(Paperclip);
export const MenuIcon = wrap(Menu);
export const SunIcon = wrap(Sun);
export const MoonIcon = wrap(Moon);
export const UserIcon = wrap(User);
export const BrainIcon = wrap(Brain);
export const PencilIcon = wrap(Pencil);
export const PlusIcon = wrap(Plus, { strokeWidth: 2.1 });
export const SearchIcon = wrap(Search);
export const VideoIcon = wrap(TvMinimalPlay);
export const LockIcon = wrap(Lock);

// ---- Added with the redesign --------------------------------------------------
export const AlarmIcon = wrap(AlarmClock);
export const AlertIcon = wrap(TriangleAlert);
export const ArrowLeftIcon = wrap(ArrowLeft);
export const ArrowRightIcon = wrap(ArrowRight);
export const ArrowUpIcon = wrap(ArrowUp);
export const AwardIcon = wrap(Award);
export const BookmarkIcon = wrap(Bookmark);
export const BookmarkFilledIcon = wrap(Bookmark, { fill: "currentColor" });
export const BotIcon = wrap(Bot);
export const BracesIcon = wrap(Braces);
export const BugIcon = wrap(Bug);
export const CalculatorIcon = wrap(Calculator);
export const CalendarIcon = wrap(Calendar);
export const CalendarCheckIcon = wrap(CalendarCheck);
export const CalendarDaysIcon = wrap(CalendarDays);
export const CaptionsIcon = wrap(Captions);
export const CircleAlertIcon = wrap(CircleAlert);
export const CircleCheckIcon = wrap(CircleCheck);
export const ClapperboardIcon = wrap(Clapperboard);
export const ClipboardIcon = wrap(ClipboardList);
export const ClockIcon = wrap(Clock);
export const CodeIcon = wrap(Code);
export const ColumnsIcon = wrap(Columns2);
export const CommandIcon = wrap(Command);
export const DiffIcon = wrap(Diff);
export const DuplicateIcon = wrap(CopyPlus);
export const ExpandIcon = wrap(Expand);
export const ExternalLinkIcon = wrap(ExternalLink);
export const EyeIcon = wrap(Eye);
export const FileCodeIcon = wrap(FileCode);
export const FileDownIcon = wrap(FileDown);
export const FileJsonIcon = wrap(FileJson);
export const FilesIcon = wrap(Files);
export const FileTextIcon = wrap(FileText);
export const FileTypeIcon = wrap(FileType);
export const FilmIcon = wrap(Film);
export const FilterIcon = wrap(Filter);
export const FlameIcon = wrap(Flame);
export const FlaskIcon = wrap(FlaskConical);
export const GamepadIcon = wrap(Gamepad2);
export const GlobeIcon = wrap(Globe);
export const GraduationCapIcon = wrap(GraduationCap);
export const GripIcon = wrap(GripVertical);
export const HeartIcon = wrap(Heart);
export const HelpIcon = wrap(CircleHelp);
export const HistoryIcon = wrap(History);
export const HomeIcon = wrap(House);
export const InfoIcon = wrap(Info);
export const KeyboardIcon = wrap(Keyboard);
export const LandmarkIcon = wrap(Landmark);
export const LanguagesIcon = wrap(Languages);
export const LayoutGridIcon = wrap(LayoutGrid);
export const ListIcon = wrap(List);
export const ListTodoIcon = wrap(ListTodo);
export const ListVideoIcon = wrap(ListVideo);
export const LogOutIcon = wrap(LogOut);
export const MapIcon = wrap(MapGlyph);
export const MaximizeIcon = wrap(Maximize2);
export const MicIcon = wrap(Mic);
export const MinimizeIcon = wrap(Minimize2);
export const MoreIcon = wrap(Ellipsis);
export const MoreVerticalIcon = wrap(EllipsisVertical);
export const MusicIcon = wrap(Music);
export const NotebookIcon = wrap(NotebookPen);
export const PaletteIcon = wrap(Palette);
export const PanelLeftIcon = wrap(PanelLeft);
export const PanelRightIcon = wrap(PanelRight);
export const PauseIcon = wrap(Pause);
export const PipIcon = wrap(PictureInPicture2);
export const PinIcon = wrap(Pin);
export const RedoIcon = wrap(Redo2);
export const ReplaceIcon = wrap(Replace);
export const ResetIcon = wrap(RotateCcw);
export const RocketIcon = wrap(Rocket);
export const ShareIcon = wrap(Share2);
export const ShieldIcon = wrap(Shield);
export const ShieldCheckIcon = wrap(ShieldCheck);
export const ShrinkIcon = wrap(Shrink);
export const SigmaIcon = wrap(Sigma);
export const SkipForwardIcon = wrap(SkipForward);
export const SlidersIcon = wrap(SlidersHorizontal);
export const SmartphoneIcon = wrap(Smartphone);
export const SparkleSmallIcon = wrap(Sparkle);
export const SpinnerIcon = wrap(LoaderCircle);
export const SquareCodeIcon = wrap(SquareCode);
export const StarIcon = wrap(Star);
export const StopIcon = wrap(Square, { fill: "currentColor" });
export const TabletIcon = wrap(Tablet);
export const TargetIcon = wrap(Target);
export const TerminalIcon = wrap(Terminal);
export const TheaterIcon = wrap(RectangleHorizontal);
export const ThumbsUpIcon = wrap(ThumbsUp);
export const TimerIcon = wrap(Timer);
export const TrophyIcon = wrap(Trophy);
export const TypeIcon = wrap(Type);
export const UndoIcon = wrap(Undo2);
export const CameraVideoIcon = wrap(Video);
export const VolumeIcon = wrap(Volume2);
export const WandIcon = wrap(WandSparkles);
export const WrapTextIcon = wrap(WrapText);
export const ZapIcon = wrap(Zap);
export const ZoomInIcon = wrap(ZoomIn);
export const ZoomOutIcon = wrap(ZoomOut);
