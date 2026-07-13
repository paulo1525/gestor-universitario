import {PlacementWorkbench} from "@/components/placement-workbench";
import {ModuleGuard} from "@/components/module-guard";

export default function PlacementTablePage(){return <ModuleGuard moduleKey="classes.placements"><PlacementWorkbench tableOnly/></ModuleGuard>}
