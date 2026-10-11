import {beforeEach,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const lineups=vi.fn(),actual=vi.fn();
vi.mock("../../../../lib/lineupsData",()=>({loadLineups:()=>lineups()}));
vi.mock("../../../../lib/actualLineupsData",()=>({loadActualLineup:(m:unknown)=>actual(m)}));
import {GET} from "./route";
beforeEach(()=>{lineups.mockReset().mockResolvedValue({matches:[{id:123}]});actual.mockReset().mockResolvedValue({state:"unavailable"});});
it("allowlists published matches and does not forward caller-provided URLs or IDs to Sorare",async()=>{
  expect((await GET(new NextRequest("http://localhost/api/lineups/actual?match=http://evil"))).status).toBe(400);
  expect((await GET(new NextRequest("http://localhost/api/lineups/actual?match=999"))).status).toBe(404);
  expect(actual).not.toHaveBeenCalled();
  const response=await GET(new NextRequest("http://localhost/api/lineups/actual?match=123&game=evil"));
  expect(response.status).toBe(200);expect(actual).toHaveBeenCalledWith({id:123});
});
