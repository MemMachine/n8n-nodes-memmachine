import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, ISupplyDataFunctions, SupplyData } from 'n8n-workflow';
export declare class MemMachine implements INodeType {
    description: INodeTypeDescription;
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
    supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData>;
}
export { MemMachine as Memory };
//# sourceMappingURL=Memory.node.d.ts.map