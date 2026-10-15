UPDATE members SET role=CASE WHEN role='admin' THEN 'boss' ELSE 'team_lead' END WHERE role IN ('admin','requester','approver','interviewer');
