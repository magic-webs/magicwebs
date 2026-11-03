"use client"

import * as Pika from "@pikaicons/core-free"
import { PikaIcon, type IconSvgElement, type PikaIconProps } from "@pikaicons/react"

// The dashboard's icons, from Pikaicons (https://pikaicons.com, MIT). Each one
// comes in a stroke style and, where the free pack has it, a solid style:
// stroke for actions and inline details, `solid` for state and emphasis (the
// active nav item, stat tiles, badges, the brand mark). Icons without a solid
// style fall back to stroke.

export type IconProps = Omit<PikaIconProps, "icon"> & { solid?: boolean }
export type Icon = React.ComponentType<IconProps>

function icon(name: string, stroke: IconSvgElement, solid: IconSvgElement = stroke): Icon {
  function PikaDashboardIcon({ solid: useSolid, ...props }: IconProps) {
    return <PikaIcon icon={useSolid ? solid : stroke} {...props} />
  }
  PikaDashboardIcon.displayName = name
  return PikaDashboardIcon
}

export const AlertTriangleIcon = icon("AlertTriangleIcon", Pika.AlertTriangleIcon, Pika.AlertTriangleSolidIcon)
export const ArrowLeftIcon = icon("ArrowLeftIcon", Pika.ArrowLeftIcon, Pika.ArrowLeftSolidIcon)
export const ArrowRightIcon = icon("ArrowRightIcon", Pika.ArrowRightIcon, Pika.ArrowRightSolidIcon)
export const BotIcon = icon("BotIcon", Pika.BotIcon, Pika.BotSolidIcon)
export const ChevronUpIcon = icon("ChevronUpIcon", Pika.ChevronUpIcon, Pika.ChevronUpSolidIcon)
export const ClockIcon =icon("ClockIcon", Pika.ClockIcon, Pika.ClockSolidIcon)
export const CopiedIcon = icon("CopiedIcon", Pika.CopyCopiedIcon, Pika.CopyCopiedSolidIcon)
export const CopyIcon = icon("CopyIcon", Pika.CopyIcon, Pika.CopySolidIcon)
export const DeleteIcon = icon("DeleteIcon", Pika.DeleteDustbin01Icon, Pika.DeleteDustbin01SolidIcon)
export const EditIcon = icon("EditIcon", Pika.PencilEditSwooshIcon, Pika.PencilEditSwooshSolidIcon)
export const ExternalLinkIcon = icon("ExternalLinkIcon", Pika.ExternalLinkSquareIcon, Pika.ExternalLinkSquareSolidIcon)
export const FolderIcon = icon("FolderIcon", Pika.FolderIcon, Pika.FolderSolidIcon)
export const GlobeIcon = icon("GlobeIcon", Pika.GlobeIcon, Pika.GlobeSolidIcon)
export const GridIcon = icon("GridIcon", Pika.GridDashboard02Icon, Pika.GridDashboard02SolidIcon)
export const HomeIcon = icon("HomeIcon", Pika.HomeIcon, Pika.HomeSolidIcon)
export const KeyIcon = icon("KeyIcon", Pika.KeyLeftIcon, Pika.KeyLeftSolidIcon)
export const LaptopIcon = icon("LaptopIcon", Pika.LaptopIcon, Pika.LaptopSolidIcon)
export const ListIcon = icon("ListIcon", Pika.BurgerMenuThreeIcon)
export const LogOutIcon = icon("LogOutIcon", Pika.LogOutRightIcon, Pika.LogOutRightSolidIcon)
export const MoonIcon = icon("MoonIcon", Pika.MoonIcon, Pika.MoonSolidIcon)
export const MoreIcon = icon("MoreIcon", Pika.ThreeDotsMenuHorizontalIcon)
export const PaintBrushIcon = icon("PaintBrushIcon", Pika.PaintBrushIcon, Pika.PaintBrushSolidIcon)
export const PieChartIcon = icon("PieChartIcon", Pika.Piechart01Icon, Pika.Piechart01SolidIcon)
export const PlusIcon = icon("PlusIcon", Pika.PlusIcon)
export const RefreshIcon = icon("RefreshIcon", Pika.RefreshIcon, Pika.RefreshSolidIcon)
export const RenameIcon = icon("RenameIcon", Pika.PencilEditIcon, Pika.PencilEditSolidIcon)
export const RocketIcon = icon("RocketIcon", Pika.RocketShipIcon, Pika.RocketShipSolidIcon)
export const SearchIcon = icon("SearchIcon", Pika.SearchIcon, Pika.SearchSolidIcon)
export const ServerIcon = icon("ServerIcon", Pika.ServerIcon, Pika.ServerSolidIcon)
export const SettingsIcon = icon("SettingsIcon", Pika.Settings01Icon, Pika.Settings01SolidIcon)
export const ShieldCheckIcon = icon("ShieldCheckIcon", Pika.ShieldCheckIcon, Pika.ShieldCheckSolidIcon)
export const SparkleIcon = icon("SparkleIcon", Pika.SparkleAi01Icon, Pika.SparkleAi01SolidIcon)
export const SunIcon = icon("SunIcon", Pika.SunIcon, Pika.SunSolidIcon)
export const UserIcon = icon("UserIcon", Pika.UserCircleIcon, Pika.UserCircleSolidIcon)
export const WalletIcon =icon("WalletIcon", Pika.WalletIcon, Pika.WalletSolidIcon)
